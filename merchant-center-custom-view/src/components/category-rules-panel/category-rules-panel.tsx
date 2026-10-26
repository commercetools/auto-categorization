/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useCallback, useEffect, useState } from 'react';
import { useCustomViewContext } from '@commercetools-frontend/application-shell-connectors';
import { useShowNotification } from '@commercetools-frontend/actions-global';
import {
  DOMAINS,
  NOTIFICATION_KINDS_SIDE,
} from '@commercetools-frontend/constants';
import { useIsAuthorized } from '@commercetools-frontend/permissions';
import Card from '@commercetools-uikit/card';
import FieldLabel from '@commercetools-uikit/field-label';
import LoadingSpinner from '@commercetools-uikit/loading-spinner';
import PrimaryButton from '@commercetools-uikit/primary-button';
import SecondaryButton from '@commercetools-uikit/secondary-button';
import SelectInput from '@commercetools-uikit/select-input';
import Spacings from '@commercetools-uikit/spacings';
import Stamp from '@commercetools-uikit/stamp';
import Text from '@commercetools-uikit/text';
import TextInput from '@commercetools-uikit/text-input';
import ToggleInput from '@commercetools-uikit/toggle-input';
import { CloseBoldIcon, PlusBoldIcon } from '@commercetools-uikit/icons';
import type { Condition, Meta, Rule } from '../../api/types';
import { useRulesApi } from '../../api/rules-api';
import { useCatalogRun } from '../../hooks/use-catalog-run';
import {
  categoryIdFromHostUrl,
  describeRule,
  emptyCondition,
  formatDateTime,
  rulesApiUrl,
  toRuleKey,
} from '../../helpers';
import ConditionRow from '../condition-row';
import RunPanel from '../run-panel';

/**
 * Auto-categorization, on the category the merchandiser already has open.
 *
 * The same rules as the standalone application, scoped to one category and
 * in the place where the question comes up. The target is not a field here
 * — it is the page — so a rule is one line of intent and a Process now
 * button, which is the whole interaction the original question described.
 */

/**
 * The permission group declared in custom-view-config.mjs, which makes
 * these names identical to the Custom Application's — one check on the
 * rules API covers both surfaces.
 */
const PERMISSIONS = {
  View: 'ViewAutoCategorization',
  Manage: 'ManageAutoCategorization',
};

type Draft = Omit<Rule, 'createdAt' | 'updatedAt'>;

/** A rule being edited opens as itself; a new one opens as one blank condition. */
const draftFrom = (rule: Rule): Draft => ({
  key: rule.key,
  name: rule.name,
  categoryId: rule.categoryId,
  enabled: rule.enabled,
  match: rule.match,
  conditions: rule.conditions,
  removeWhenNoLongerMatching: rule.removeWhenNoLongerMatching,
});

const blankDraft = (categoryId: string, meta: Meta): Draft => ({
  key: '',
  name: '',
  categoryId,
  enabled: true,
  match: 'all',
  conditions: [emptyCondition(meta)],
  removeWhenNoLongerMatching: true,
});

type RuleFormProps = {
  draft: Draft;
  meta: Meta;
  saving: boolean;
  issues: string[];
  saveLabel: string;
  title: string;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
};

/** The same form for a new rule and an existing one — one rule, one shape. */
const RuleForm = ({
  draft,
  meta,
  saving,
  issues,
  saveLabel,
  title,
  onChange,
  onCancel,
  onSave,
}: RuleFormProps) => (
  <Card type="raised" theme="light">
    <Spacings.Stack scale="s">
      <Spacings.Inline justifyContent="space-between" alignItems="center">
        <Text.Subheadline as="h5">{title}</Text.Subheadline>
        <SecondaryButton
          iconLeft={<CloseBoldIcon />}
          label="Cancel"
          onClick={onCancel}
        />
      </Spacings.Inline>

      <Spacings.Stack scale="xs">
        <FieldLabel
          title="Name (required)"
          htmlFor="name"
          hintIcon={undefined}
        />
        <TextInput
          id="name"
          name="name"
          value={draft.name}
          placeholder="For example: New products"
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </Spacings.Stack>

      <Spacings.Inline scale="xs" alignItems="center">
        <Text.Detail>A product qualifies when</Text.Detail>
        <div style={{ minWidth: 180 }}>
          <SelectInput
            name="match"
            value={draft.match}
            options={[
              { value: 'all', label: 'every condition holds' },
              { value: 'any', label: 'any condition holds' },
            ]}
            onChange={(event) =>
              onChange({
                ...draft,
                match: event.target.value as 'all' | 'any',
              })
            }
          />
        </div>
      </Spacings.Inline>

      {draft.conditions.map((condition, index) => (
        <ConditionRow
          key={index}
          condition={condition}
          meta={meta}
          onChange={(next: Condition) =>
            onChange({
              ...draft,
              conditions: draft.conditions.map((existing, position) =>
                position === index ? next : existing
              ),
            })
          }
          onRemove={() =>
            onChange({
              ...draft,
              conditions: draft.conditions.filter(
                (_existing, position) => position !== index
              ),
            })
          }
        />
      ))}

      <Spacings.Inline scale="xs" alignItems="center">
        <SecondaryButton
          iconLeft={<PlusBoldIcon />}
          label="Add condition"
          onClick={() =>
            onChange({
              ...draft,
              conditions: [...draft.conditions, emptyCondition(meta)],
            })
          }
        />
        <ToggleInput
          isChecked={draft.enabled}
          size="small"
          onChange={(event) =>
            onChange({ ...draft, enabled: event.target.checked })
          }
        />
        <Text.Detail>Active</Text.Detail>
        <ToggleInput
          isChecked={draft.removeWhenNoLongerMatching}
          size="small"
          onChange={(event) =>
            onChange({
              ...draft,
              removeWhenNoLongerMatching: event.target.checked,
            })
          }
        />
        <Text.Detail>Remove products that stop qualifying</Text.Detail>
      </Spacings.Inline>

      {!draft.name.trim() && (
        <Text.Detail tone="secondary">
          A rule needs a name before it can be saved.
        </Text.Detail>
      )}

      {issues.map((issue) => (
        <Text.Body key={issue} tone="critical">
          {issue}
        </Text.Body>
      ))}

      <Spacings.Inline scale="s">
        <SecondaryButton label="Cancel" onClick={onCancel} />
        <PrimaryButton
          label={saving ? 'Saving…' : saveLabel}
          isDisabled={saving || !draft.name.trim()}
          onClick={onSave}
        />
      </Spacings.Inline>
    </Spacings.Stack>
  </Card>
);

RuleForm.displayName = 'RuleForm';

const extractIssues = (error: unknown): string[] => {
  const body = (error as { body?: { issues?: string[]; message?: string } })
    ?.body;
  if (body?.issues?.length) return body.issues;
  if (body?.message) return [body.message];
  return [error instanceof Error ? error.message : String(error)];
};

const CategoryRulesPanel = ({ meta }: { meta: Meta }) => {
  const hostUrl = useCustomViewContext((context) => context.hostUrl);
  const categoryId = categoryIdFromHostUrl(hostUrl);
  const showNotification = useShowNotification();
  const canManage = useIsAuthorized({
    demandedPermissions: [PERMISSIONS.Manage],
  });

  const api = useRulesApi(rulesApiUrl());

  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState<Draft>();
  /** Set while an existing rule is open; the form then takes that card's place. */
  const [editingKey, setEditingKey] = useState<string>();
  const [issues, setIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    if (!categoryId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .listRules(categoryId)
      .then(setRules)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : String(caught))
      )
      .finally(() => setLoading(false));
  }, [api, categoryId]);

  useEffect(reload, [reload]);

  const runCall = useCallback(
    (body: { cursor?: string; dryRun?: boolean }) =>
      api.runCategory(categoryId as string, body),
    [api, categoryId]
  );
  const run = useCatalogRun(runCall);

  const close = () => {
    setDraft(undefined);
    setEditingKey(undefined);
    setIssues([]);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setIssues([]);
    try {
      // An existing rule keeps its key, so the save is an update rather
      // than a second rule wearing the same name.
      const saved = await api.saveRule({
        ...draft,
        key: draft.key || toRuleKey(draft.name),
        categoryId: categoryId as string,
      });
      showNotification({
        domain: DOMAINS.SIDE,
        kind: NOTIFICATION_KINDS_SIDE.success,
        text: editingKey
          ? `Rule "${saved.name}" updated. Bringing the catalog into line with it now.`
          : `Rule "${saved.name}" saved. Bringing the catalog into line with it now.`,
      });
      close();
      reload();
      // Saving a rule decides what the category should hold; it does not
      // move anything. Leaving that to a second button is what makes a new
      // rule look like it did nothing, so the pass starts here and the
      // panel below shows it happening.
      void run.start(false);
    } catch (caught) {
      setIssues(extractIssues(caught));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (rule: Rule) => {
    await api.saveRule({ ...rule, enabled: !rule.enabled });
    reload();
  };

  const remove = async (rule: Rule) => {
    await api.deleteRule(rule.key);
    showNotification({
      domain: DOMAINS.SIDE,
      kind: NOTIFICATION_KINDS_SIDE.success,
      text: `Rule "${rule.name}" deleted.`,
    });
    reload();
  };

  if (!categoryId) {
    return (
      <Text.Body>
        Open a category to see the rules that fill it. This panel reads the
        category from the page it is rendered on.
      </Text.Body>
    );
  }

  if (loading) return <LoadingSpinner />;

  const form = draft ? (
    <RuleForm
      draft={draft}
      meta={meta}
      saving={saving}
      issues={issues}
      saveLabel={editingKey ? 'Save changes' : 'Save rule'}
      title={editingKey ? 'Edit rule' : 'New rule'}
      onChange={setDraft}
      onCancel={close}
      onSave={save}
    />
  ) : null;

  return (
    <Spacings.Stack scale="m">
      <Spacings.Stack scale="xs">
        <Text.Subheadline as="h4">Auto-categorization</Text.Subheadline>
        <Text.Detail tone="secondary">
          Products matching any active rule below belong in this category. New
          and edited products are assigned as they are saved.
        </Text.Detail>
      </Spacings.Stack>

      {error && <Text.Body tone="critical">{error}</Text.Body>}

      {rules.length === 0 && !draft && (
        <Text.Body>
          No rules yet. This category holds only what has been put in it by
          hand.
        </Text.Body>
      )}

      {rules.map((rule) =>
        editingKey === rule.key && draft ? (
          <div key={rule.key}>{form}</div>
        ) : (
          <Card key={rule.key} type="flat" theme="light">
            <Spacings.Inline
              justifyContent="space-between"
              alignItems="center"
              scale="s"
            >
              <Spacings.Stack scale="xs">
                <Spacings.Inline scale="xs" alignItems="center">
                  <Text.Body isBold>{rule.name}</Text.Body>
                  {rule.enabled ? (
                    <Stamp tone="primary" label="Active" isCondensed />
                  ) : (
                    <Stamp tone="secondary" label="Off" isCondensed />
                  )}
                  {!rule.removeWhenNoLongerMatching && (
                    <Stamp tone="information" label="Adds only" isCondensed />
                  )}
                </Spacings.Inline>
                <Text.Detail tone="secondary">
                  {describeRule(rule, meta)}
                </Text.Detail>
                <Text.Detail tone="secondary">
                  Edited {formatDateTime(rule.updatedAt)}
                </Text.Detail>
              </Spacings.Stack>

              <Spacings.Inline scale="xs" alignItems="center">
                <ToggleInput
                  isChecked={rule.enabled}
                  isDisabled={!canManage || Boolean(draft)}
                  size="small"
                  onChange={() => toggle(rule)}
                />
                <SecondaryButton
                  label="Edit"
                  isDisabled={!canManage || Boolean(draft)}
                  onClick={() => {
                    setIssues([]);
                    setDraft(draftFrom(rule));
                    setEditingKey(rule.key);
                  }}
                />
                <SecondaryButton
                  label="Delete"
                  isDisabled={!canManage || Boolean(draft)}
                  onClick={() => remove(rule)}
                />
              </Spacings.Inline>
            </Spacings.Inline>
          </Card>
        )
      )}

      {draft && !editingKey && form}

      {!draft && rules.length === 0 && (
        <div>
          <SecondaryButton
            iconLeft={<PlusBoldIcon />}
            label="Add a rule to this category"
            isDisabled={!canManage}
            onClick={() => setDraft(blankDraft(categoryId, meta))}
          />
        </div>
      )}

      {!draft && rules.length > 0 && (
        <Text.Detail tone="secondary">
          A category holds one rule. Edit the rule above to change what fills
          this category, or delete it to fill the category by hand.
        </Text.Detail>
      )}

      {(rules.length > 0 || run.state.running || run.state.result) && (
        <RunPanel
          state={run.state}
          disabled={!canManage}
          onPreview={() => run.start(true)}
          onRun={() => run.start(false)}
          onStop={run.stop}
          embeddedInHostPage
          emptyMessage="Preview to see what these rules would change across the catalog, or process them now."
        />
      )}
    </Spacings.Stack>
  );
};

CategoryRulesPanel.displayName = 'CategoryRulesPanel';

export default CategoryRulesPanel;
