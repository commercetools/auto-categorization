/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { InfoDialog } from '@commercetools-frontend/application-components';
import LoadingSpinner from '@commercetools-uikit/loading-spinner';
import SecondaryButton from '@commercetools-uikit/secondary-button';
import SecondaryIconButton from '@commercetools-uikit/secondary-icon-button';
import Spacings from '@commercetools-uikit/spacings';
import Stamp from '@commercetools-uikit/stamp';
import Text from '@commercetools-uikit/text';
import TextInput from '@commercetools-uikit/text-input';
import {
  AngleDownIcon,
  AngleRightIcon,
  SearchIcon,
} from '@commercetools-uikit/icons';
import type { CategoryOption } from '../../hooks/use-categories';

/**
 * Choosing a category out of a real catalog.
 *
 * A dropdown works for twenty categories and fails for hundreds: the
 * merchandiser either knows the exact name or scrolls. So this offers both
 * ways in, in one dialog — type to search across every category by name,
 * key or path, or open the tree and walk down to it. Searching and
 * browsing are the same list under two presentations, and the same click
 * selects in either.
 */

type CategoryPickerProps = {
  categories: CategoryOption[];
  /** False while pages are still arriving; the dialog says so. */
  complete: boolean;
  loading: boolean;
  selectedId?: string;
  /**
   * Categories that already have a rule. A category holds one rule, so
   * these are shown and explained rather than hidden — a merchandiser
   * looking for "Boots" needs to find out it is taken, not that it is
   * missing.
   */
  takenIds?: Set<string>;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (categoryId: string) => void;
};

/** How many search hits to render before the rest are only counted. */
const MAX_HITS = 100;

const normalize = (value: string) => value.trim().toLowerCase();

export const matchesQuery = (
  category: CategoryOption,
  query: string
): boolean => {
  const needle = normalize(query);
  if (!needle) return true;
  return (
    category.name.toLowerCase().includes(needle) ||
    category.label.toLowerCase().includes(needle) ||
    (category.key ?? '').toLowerCase().includes(needle)
  );
};

/** Parent id → its children, in the order the API returned them. */
export const childrenByParent = (
  categories: CategoryOption[]
): Map<string, CategoryOption[]> => {
  const known = new Set(categories.map((category) => category.value));
  const map = new Map<string, CategoryOption[]>();

  for (const category of categories) {
    // A category whose parent was not returned is shown at the root rather
    // than dropped, so a partial read loses depth and never loses a branch.
    const parent =
      category.parentId && known.has(category.parentId)
        ? category.parentId
        : '';
    const siblings = map.get(parent) ?? [];
    siblings.push(category);
    map.set(parent, siblings);
  }

  return map;
};

/**
 * Every ancestor of every match, so a hit deep in the tree is reachable
 * without the merchandiser guessing which branch it is under.
 */
export const branchesToExpand = (
  categories: CategoryOption[],
  query: string
): Set<string> => {
  if (!normalize(query)) return new Set();

  const byId = new Map(
    categories.map((category) => [category.value, category])
  );
  const expanded = new Set<string>();

  for (const category of categories) {
    if (!matchesQuery(category, query)) continue;
    let parentId = category.parentId;
    while (parentId && byId.has(parentId) && !expanded.has(parentId)) {
      expanded.add(parentId);
      parentId = byId.get(parentId)?.parentId;
    }
  }

  return expanded;
};

type RowProps = {
  label: string;
  /** The category key, shown muted after the name in search results. */
  hint?: string;
  count?: number;
  indent?: number;
  isSelected?: boolean;
  isTaken?: boolean;
  expandable?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
  onChoose: () => void;
};

/**
 * One category, in the tree and in the search results alike.
 *
 * The whole row is the target rather than the few pixels of the name, and
 * it carries its own hover, so a list of 347 is something you can run a
 * cursor down. A taken category stays readable and stops being clickable —
 * greying it out entirely would make it look like it did not exist.
 */
const Row = ({
  label,
  hint,
  count,
  indent = 0,
  isSelected,
  isTaken,
  expandable,
  isOpen,
  onToggle,
  onChoose,
}: RowProps) => {
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 32,
        paddingLeft: 8 + indent * 22,
        paddingRight: 8,
        borderRadius: 4,
        background: isSelected
          ? 'var(--color-primary-95, #eef1fb)'
          : hover && !isTaken
          ? 'var(--color-neutral-95, #f4f4f4)'
          : 'transparent',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {expandable ? (
        <SecondaryIconButton
          label={isOpen ? `Collapse ${label}` : `Expand ${label}`}
          icon={isOpen ? <AngleDownIcon /> : <AngleRightIcon />}
          size="20"
          onClick={onToggle}
        />
      ) : (
        <span style={{ display: 'inline-block', width: 20, flexShrink: 0 }} />
      )}

      <button
        type="button"
        disabled={isTaken}
        onClick={onChoose}
        title={isTaken ? 'This category already has a rule' : label}
        style={{
          flexGrow: 1,
          minWidth: 0,
          textAlign: 'left',
          background: 'none',
          border: 'none',
          padding: '4px 0',
          font: 'inherit',
          cursor: isTaken ? 'not-allowed' : 'pointer',
          color: isTaken
            ? 'var(--color-neutral-60, #9b9b9b)'
            : 'var(--color-solid, #1a1a1a)',
          fontWeight: isSelected ? 600 : 400,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
        {hint ? (
          <span
            style={{ color: 'var(--color-neutral-60, #9b9b9b)', marginLeft: 8 }}
          >
            {hint}
          </span>
        ) : null}
        {count ? (
          <span
            style={{ color: 'var(--color-neutral-60, #9b9b9b)', marginLeft: 8 }}
          >
            {count}
          </span>
        ) : null}
      </button>

      {isSelected && <Stamp tone="primary" label="Selected" isCondensed />}
      {isTaken && <Stamp tone="information" label="Has a rule" isCondensed />}
    </div>
  );
};

Row.displayName = 'Row';

const CategoryPicker = ({
  categories,
  complete,
  loading,
  selectedId,
  takenIds,
  isOpen,
  onClose,
  onSelect,
}: CategoryPickerProps) => {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const children = useMemo(() => childrenByParent(categories), [categories]);
  const roots = children.get('') ?? [];

  // Opening the dialog on a chosen category opens the branch it is in, so
  // the current answer is on screen rather than collapsed out of sight.
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    if (!selectedId) {
      setExpanded(new Set());
      return;
    }
    const byId = new Map(categories.map((c) => [c.value, c]));
    const open = new Set<string>();
    let parentId = byId.get(selectedId)?.parentId;
    while (parentId && byId.has(parentId) && !open.has(parentId)) {
      open.add(parentId);
      parentId = byId.get(parentId)?.parentId;
    }
    setExpanded(open);
  }, [isOpen, selectedId, categories]);

  const searching = normalize(query).length > 0;
  const forcedOpen = useMemo(
    () => branchesToExpand(categories, query),
    [categories, query]
  );

  const isExpanded = useCallback(
    (id: string) => expanded.has(id) || forcedOpen.has(id),
    [expanded, forcedOpen]
  );

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id) || forcedOpen.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const hits = useMemo(
    () =>
      searching
        ? categories.filter((category) => matchesQuery(category, query))
        : [],
    [categories, query, searching]
  );

  const isTaken = useCallback(
    (id: string) => Boolean(takenIds?.has(id)) && id !== selectedId,
    [takenIds, selectedId]
  );

  const choose = (id: string) => {
    if (isTaken(id)) return;
    onSelect(id);
    onClose();
  };

  const renderBranch = (category: CategoryOption, depth: number) => {
    const kids = children.get(category.value) ?? [];
    const open = isExpanded(category.value);

    return (
      <div key={category.value}>
        <Row
          label={category.name || category.key || category.value}
          count={kids.length}
          indent={depth}
          isSelected={category.value === selectedId}
          isTaken={isTaken(category.value)}
          expandable={kids.length > 0}
          isOpen={open}
          onToggle={() => toggle(category.value)}
          onChoose={() => choose(category.value)}
        />
        {open && kids.map((child) => renderBranch(child, depth + 1))}
      </div>
    );
  };

  return (
    <InfoDialog
      title="Choose a category"
      isOpen={isOpen}
      onClose={onClose}
      size="scale"
    >
      <Spacings.Stack scale="m">
        <Spacings.Inline scale="xs" alignItems="center">
          <SearchIcon />
          <div style={{ flexGrow: 1 }}>
            <TextInput
              name="category-search"
              value={query}
              placeholder="Search by name, path or key"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {searching && (
            <SecondaryButton label="Clear" onClick={() => setQuery('')} />
          )}
        </Spacings.Inline>

        <Text.Detail tone="secondary">
          {searching
            ? `${hits.length} of ${categories.length} categories match`
            : `${categories.length} categories. Open a branch to walk down it, or search.`}
          {takenIds && takenIds.size > 0
            ? ` A category holds one rule; ${takenIds.size} already have one.`
            : ''}
        </Text.Detail>

        {!complete && !loading && (
          <Text.Detail tone="warning">
            Still reading the category tree — some branches may be missing.
          </Text.Detail>
        )}

        {loading && categories.length === 0 ? (
          <LoadingSpinner />
        ) : (
          <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
            {searching ? (
              <Spacings.Stack scale="xs">
                {hits.length === 0 && (
                  <Text.Body>
                    Nothing matches “{query}”. Clear the search to browse the
                    tree.
                  </Text.Body>
                )}
                {hits.slice(0, MAX_HITS).map((category) => (
                  <Row
                    key={category.value}
                    label={category.label}
                    hint={category.key ?? undefined}
                    isSelected={category.value === selectedId}
                    isTaken={isTaken(category.value)}
                    onChoose={() => choose(category.value)}
                  />
                ))}
                {hits.length > MAX_HITS && (
                  <Text.Detail tone="secondary">
                    Showing the first {MAX_HITS}. Narrow the search to see the
                    other {hits.length - MAX_HITS}.
                  </Text.Detail>
                )}
              </Spacings.Stack>
            ) : (
              roots.map((category) => renderBranch(category, 0))
            )}
          </div>
        )}
      </Spacings.Stack>
    </InfoDialog>
  );
};

CategoryPicker.displayName = 'CategoryPicker';

export default CategoryPicker;
