/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory, useParams, useRouteMatch } from 'react-router-dom';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { PageNotFound } from '@commercetools-frontend/application-components';
import { useShowNotification } from '@commercetools-frontend/actions-global';
import {
  DOMAINS,
  NOTIFICATION_KINDS_SIDE,
} from '@commercetools-frontend/constants';
import { useIsAuthorized } from '@commercetools-frontend/permissions';
import Constraints from '@commercetools-uikit/constraints';
import FieldLabel from '@commercetools-uikit/field-label';
import LoadingSpinner from '@commercetools-uikit/loading-spinner';
import PrimaryButton from '@commercetools-uikit/primary-button';
import SecondaryButton from '@commercetools-uikit/secondary-button';
import SelectInput from '@commercetools-uikit/select-input';
import Spacings from '@commercetools-uikit/spacings';
import Text from '@commercetools-uikit/text';
import TextInput from '@commercetools-uikit/text-input';
import ToggleInput from '@commercetools-uikit/toggle-input';
import { PlusBoldIcon, TreeStructureIcon } from '@commercetools-uikit/icons';
import type { Condition, Meta, Rule } from '../../api/types';
import { useRulesApi } from '../../api/rules-api';
import { useCategories } from '../../hooks/use-categories';
import { useCatalogRun } from '../../hooks/use-catalog-run';
import { emptyCondition, rulesApiUrl, toRuleKey } from '../../helpers';
import { PERMISSIONS } from '../../constants';
import CategoryPicker from '../category-picker/category-picker';
import ConditionRow from './condition-row';
import RunPanel from '../run-panel/run-panel';

/**
 * The rule builder.
 *
 * A rule is a target category plus a set of conditions, and the page says
 * so in that order: what fills, then what qualifies. Preview and Process
 * now sit on the same page as the conditions, because the question a
 * merchandiser actually has — "what would this do to my catalog?" — is
 * answerable only against the rule in front of them.
 */

type RuleEditorProps = {
  meta: Meta;
  backUrl: string;
};

const blankRule = (): Omit<Rule, 'createdAt' | 'updatedAt'> => ({
  key: '',
  name: '',
  categoryId: '',
  enabled: true,
  match: 'all',
  conditions: [],
  removeWhenNoLongerMatching: true,
});

const extractIssues = (error: unknown): string[] => {
  const body = (error as { body?: { issues?: string[]; message?: string } })
    ?.body;
  if (body?.issues?.length) return body.issues;
  if (body?.message) return [body.message];
  return [error instanceof Error ? error.message : String(error)];
};

const RuleEditor = ({ meta, backUrl }: RuleEditorProps) => {
  const { ruleKey } = useParams<{ ruleKey?: string }>();
  const history = useHistory();
  const showNotification = useShowNotification();
  const canManage = useIsAuthorized({
    demandedPermissions: [PERMISSIONS.Manage],
  });

  const dataLocale =
    useApplicationContext<string>((context) => context.dataLocale ?? 'en') ??
    'en';
  const {
    categories,
    complete: categoriesComplete,
    loading: categoriesLoading,
  } = useCategories(dataLocale);
  const api = useRulesApi(rulesApiUrl());

  const isNew = !ruleKey || ruleKey === 'new';
  const [draft, setDraft] =
    useState<Omit<Rule, 'createdAt' | 'updatedAt'>>(blankRule);
  const [loading, setLoading] = useState(!isNew);
  const [notFound, setNotFound] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  /**
   * Which categories already have a rule. A category holds one rule, so
   * the picker refuses a taken one rather than letting the save fail.
   */
  const [takenIds, setTakenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isNew) {
      setDraft({ ...blankRule(), conditions: [emptyCondition(meta)] });
      setLoading(false);
      return;
    }

    let live = true;
    setLoading(true);
    api
      .getRule(ruleKey)
      .then((rule) => {
        if (live) setDraft(rule);
      })
      .catch(() => {
        if (live) setNotFound(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [api, isNew, ruleKey, meta]);

  useEffect(() => {
    let live = true;
    api
      .listRules()
      .then((all) => {
        if (!live) return;
        setTakenIds(
          new Set(
            all
              .filter((rule) => rule.key !== ruleKey)
              .map((rule) => rule.categoryId)
          )
        );
      })
      .catch(() => {
        // Without the list the picker simply offers everything; the API
        // still refuses a second rule on a category.
      });

    return () => {
      live = false;
    };
  }, [api, ruleKey]);

  const update = useCallback(
    (patch: Partial<Omit<Rule, 'createdAt' | 'updatedAt'>>) => {
      setDraft((current) => ({ ...current, ...patch }));
      setDirty(true);
    },
    []
  );

  const runCall = useCallback(
    (body: { cursor?: string; dryRun?: boolean }) =>
      api.runRule(draft.key, body),
    [api, draft.key]
  );
  const run = useCatalogRun(runCall);

  const save = async () => {
    setSaving(true);
    setIssues([]);
    try {
      const key = draft.key || toRuleKey(draft.name);
      const saved = await api.saveRule({ ...draft, key });
      setDraft(saved);
      setDirty(false);
      showNotification({
        domain: DOMAINS.SIDE,
        kind: NOTIFICATION_KINDS_SIDE.success,
        text: `Rule "${saved.name}" saved. Process it now to apply it to the products already in the catalog.`,
      });
      if (isNew) history.replace(`${backUrl}/${saved.key}`);
    } catch (error) {
      setIssues(extractIssues(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    await api.deleteRule(draft.key);
    showNotification({
      domain: DOMAINS.SIDE,
      kind: NOTIFICATION_KINDS_SIDE.success,
      text: `Rule "${draft.name}" deleted. The products it was holding in its category will be released on the next pass.`,
    });
    history.push(backUrl);
  };

  // The editor's selects take the flattened list as it comes; the category
  // condition and the target picker offer exactly the same choices.
  const categoryOptions = useMemo(() => categories, [categories]);

  if (notFound) return <PageNotFound />;
  if (loading) return <LoadingSpinner />;

  const canRun = !isNew && !dirty && canManage;

  return (
    <Spacings.Stack scale="l">
      <Spacings.Inline justifyContent="space-between" alignItems="center">
        <Text.Headline as="h2">
          {isNew ? 'New rule' : draft.name || 'Rule'}
        </Text.Headline>
        <Spacings.Inline scale="s">
          <SecondaryButton
            label="Back to rules"
            onClick={() => history.push(backUrl)}
          />
          {!isNew && canManage && (
            <SecondaryButton label="Delete rule" onClick={remove} />
          )}
          <PrimaryButton
            label={saving ? 'Saving…' : 'Save'}
            onClick={save}
            isDisabled={saving || !canManage}
          />
        </Spacings.Inline>
      </Spacings.Inline>

      {issues.length > 0 && (
        <Spacings.Stack scale="xs">
          {issues.map((issue) => (
            <Text.Body key={issue} tone="critical">
              {issue}
            </Text.Body>
          ))}
        </Spacings.Stack>
      )}

      <Constraints.Horizontal max={16}>
        <Spacings.Stack scale="s">
          <FieldLabel title="Name (required)" hintIcon={undefined} />
          <TextInput
            name="name"
            value={draft.name}
            isDisabled={!canManage}
            placeholder="New products"
            onChange={(event) => update({ name: event.target.value })}
          />
        </Spacings.Stack>
      </Constraints.Horizontal>

      <Constraints.Horizontal max={16}>
        <Spacings.Stack scale="s">
          <FieldLabel
            title="Fills this category (required)"
            hintIcon={undefined}
          />
          <Spacings.Inline scale="s" alignItems="center">
            <SecondaryButton
              iconLeft={<TreeStructureIcon />}
              label={draft.categoryId ? 'Change category' : 'Choose category'}
              isDisabled={!canManage}
              onClick={() => setPickerOpen(true)}
            />
            {draft.categoryId ? (
              <Text.Body>
                {categoryOptions.find(
                  (option) => option.value === draft.categoryId
                )?.label ?? draft.categoryId}
              </Text.Body>
            ) : (
              <Text.Detail tone="secondary">No category chosen yet</Text.Detail>
            )}
          </Spacings.Inline>

          <CategoryPicker
            categories={categoryOptions}
            complete={categoriesComplete}
            loading={categoriesLoading}
            selectedId={draft.categoryId || undefined}
            takenIds={takenIds}
            isOpen={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onSelect={(categoryId) => update({ categoryId })}
          />
        </Spacings.Stack>
      </Constraints.Horizontal>

      <Spacings.Stack scale="s">
        <Spacings.Inline scale="s" alignItems="center">
          <Text.Subheadline as="h4">A product qualifies when</Text.Subheadline>
          <div style={{ minWidth: 180 }}>
            <SelectInput
              name="match"
              value={draft.match}
              isDisabled={!canManage}
              options={[
                { value: 'all', label: 'every condition holds' },
                { value: 'any', label: 'any condition holds' },
              ]}
              onChange={(event) =>
                update({ match: event.target.value as 'all' | 'any' })
              }
            />
          </div>
        </Spacings.Inline>

        <Spacings.Stack scale="s">
          {draft.conditions.map((condition, index) => (
            <ConditionRow
              key={index}
              condition={condition}
              meta={meta}
              categories={categoryOptions}
              isDisabled={!canManage}
              onChange={(next: Condition) =>
                update({
                  conditions: draft.conditions.map((existing, position) =>
                    position === index ? next : existing
                  ),
                })
              }
              onRemove={() =>
                update({
                  conditions: draft.conditions.filter(
                    (_existing, position) => position !== index
                  ),
                })
              }
            />
          ))}
        </Spacings.Stack>

        <div>
          <SecondaryButton
            iconLeft={<PlusBoldIcon />}
            label="Add condition"
            isDisabled={!canManage}
            onClick={() =>
              update({
                conditions: [...draft.conditions, emptyCondition(meta)],
              })
            }
          />
        </div>
      </Spacings.Stack>

      <Spacings.Stack scale="s">
        <Spacings.Inline scale="s" alignItems="center">
          <ToggleInput
            isChecked={draft.enabled}
            isDisabled={!canManage}
            size="small"
            onChange={(event) => update({ enabled: event.target.checked })}
          />
          <Text.Body>
            Active. A rule that is off assigns nothing and holds nothing in
            place.
          </Text.Body>
        </Spacings.Inline>

        <Spacings.Inline scale="s" alignItems="center">
          <ToggleInput
            isChecked={draft.removeWhenNoLongerMatching}
            isDisabled={!canManage}
            size="small"
            onChange={(event) =>
              update({ removeWhenNoLongerMatching: event.target.checked })
            }
          />
          <Text.Body>
            Take the category away again when a product stops qualifying. With
            this on, the category&rsquo;s membership is exactly what the rules
            say.
          </Text.Body>
        </Spacings.Inline>
      </Spacings.Stack>

      <RunPanel
        state={run.state}
        disabled={!canRun}
        onPreview={() => run.start(true)}
        onRun={() => run.start(false)}
        onStop={run.stop}
        emptyMessage={
          dirty
            ? 'Save the rule to preview or process it.'
            : 'Preview to see what this rule would change, or process it against the catalog now.'
        }
      />

      <Text.Detail tone="secondary">
        New and edited products are assigned the moment they are saved — the
        connector runs inside the product write itself. Processing is for the
        products that were already in the catalog when the rule was written.
      </Text.Detail>
    </Spacings.Stack>
  );
};

RuleEditor.displayName = 'RuleEditor';

export const useRuleEditorMatch = () => useRouteMatch();

export default RuleEditor;
