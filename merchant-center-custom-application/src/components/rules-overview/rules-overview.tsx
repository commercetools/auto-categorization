/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { useIsAuthorized } from '@commercetools-frontend/permissions';
import DataTable from '@commercetools-uikit/data-table';
import LoadingSpinner from '@commercetools-uikit/loading-spinner';
import PrimaryButton from '@commercetools-uikit/primary-button';
import Spacings from '@commercetools-uikit/spacings';
import Stamp from '@commercetools-uikit/stamp';
import Text from '@commercetools-uikit/text';
import { PlusBoldIcon } from '@commercetools-uikit/icons';
import type { Meta, Rule } from '../../api/types';
import { useRulesApi } from '../../api/rules-api';
import { useCategories } from '../../hooks/use-categories';
import { describeRule, formatDateTime, rulesApiUrl } from '../../helpers';
import { PERMISSIONS } from '../../constants';

/**
 * Every rule in the Project, and what each one says in words.
 *
 * The conditions column is the point of the screen: a merchandiser should
 * be able to read down it and know what fills every rule-driven category
 * without opening anything.
 */

type RulesOverviewProps = {
  meta: Meta;
  baseUrl: string;
};

/** DataTable identifies rows by `id`; a rule's identity is its key. */
type RuleRow = Rule & { id: string };

const columns = [
  { key: 'name', label: 'Rule' },
  { key: 'category', label: 'Fills' },
  { key: 'conditions', label: 'When' },
  { key: 'status', label: 'Status' },
  { key: 'updatedAt', label: 'Last edited' },
];

const RulesOverview = ({ meta, baseUrl }: RulesOverviewProps) => {
  const history = useHistory();
  const canManage = useIsAuthorized({ demandedPermissions: [PERMISSIONS.Manage] });
  const dataLocale =
    useApplicationContext<string>((context) => context.dataLocale ?? 'en') ??
    'en';
  const { categories } = useCategories(dataLocale);
  const api = useRulesApi(rulesApiUrl());

  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    api
      .listRules()
      .then((result) => {
        if (live) setRules(result);
      })
      .catch((caught) => {
        if (live) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [api]);

  const categoryLabel = useCallback(
    (id: string) => categories.find((category) => category.value === id)?.label,
    [categories]
  );

  const rows: RuleRow[] = useMemo(
    () => rules.map((rule) => ({ ...rule, id: rule.key })),
    [rules]
  );

  const renderItem = useMemo(
    () => (rule: RuleRow, column: { key: string }) => {
      switch (column.key) {
        case 'name':
          return rule.name;
        case 'category':
          return categoryLabel(rule.categoryId) ?? rule.categoryId;
        case 'conditions':
          return describeRule(rule, meta, categoryLabel);
        case 'status':
          return rule.enabled ? (
            <Stamp tone="primary" label="Active" isCondensed />
          ) : (
            <Stamp tone="secondary" label="Off" isCondensed />
          );
        case 'updatedAt':
          return formatDateTime(rule.updatedAt);
        default:
          return null;
      }
    },
    [categoryLabel, meta]
  );

  if (loading) return <LoadingSpinner />;

  return (
    <Spacings.Stack scale="l">
      <Spacings.Inline justifyContent="space-between" alignItems="center">
        <Spacings.Stack scale="xs">
          <Text.Headline as="h2">Auto-categorization</Text.Headline>
          <Text.Detail tone="secondary">
            A category with rules fills itself. New and edited products are
            assigned as they are saved; use Process now on a rule to bring the
            products already in the catalog into line.
          </Text.Detail>
        </Spacings.Stack>
        <PrimaryButton
          iconLeft={<PlusBoldIcon />}
          label="New rule"
          isDisabled={!canManage}
          onClick={() => history.push(`${baseUrl}/new`)}
        />
      </Spacings.Inline>

      {error && <Text.Body tone="critical">{error}</Text.Body>}

      {!error && rules.length === 0 ? (
        <Text.Body>
          No rules yet. Create one to have a category fill itself from the
          products that match it.
        </Text.Body>
      ) : (
        <DataTable<RuleRow>
          rows={rows}
          columns={columns}
          itemRenderer={renderItem}
          onRowClick={(rule) => history.push(`${baseUrl}/${rule.key}`)}
        />
      )}
    </Spacings.Stack>
  );
};

RulesOverview.displayName = 'RulesOverview';

export default RulesOverview;
