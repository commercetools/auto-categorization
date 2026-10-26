/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Condition, FieldOption, Meta, Rule } from './api/types';
import { NULLARY_OPERATORS } from './api/types';

/** Where the rules API lives, as Connect wired it in at deploy time. */
export const rulesApiUrl = (): string => {
  const app = (
    window as unknown as {
      app?: { rulesApiUrl?: string };
    }
  ).app;
  const url = app?.rulesApiUrl;
  if (!url) {
    throw new Error(
      'RULES_API_URL is not configured. Set it on the deployment to the rules-api application URL.'
    );
  }
  return `${url.replace(/\/$/, '')}/rules-api`;
};

export const fieldOptionFor = (
  meta: Meta | undefined,
  condition: Condition
): FieldOption | undefined =>
  meta?.fields.find(
    (option) =>
      option.field.kind === condition.field.kind &&
      option.field.attributeName === condition.field.attributeName
  );

/** One condition, the way it reads on the rule list. */
export const describeCondition = (
  condition: Condition,
  meta?: Meta,
  categoryLabel?: (id: string) => string | undefined
): string => {
  const field = fieldOptionFor(meta, condition)?.label ?? condition.field.kind;
  const operator = meta?.operatorLabels?.[condition.operator] ?? condition.operator;

  if (NULLARY_OPERATORS.includes(condition.operator)) {
    return `${field} ${operator}`;
  }

  const value =
    condition.field.valueKind === 'category' && categoryLabel
      ? (categoryLabel(String(condition.value)) ?? String(condition.value))
      : String(condition.value);

  return `${field} ${operator} ${value}`;
};

export const describeRule = (
  rule: Rule,
  meta?: Meta,
  categoryLabel?: (id: string) => string | undefined
): string => {
  const joiner = rule.match === 'all' ? ' and ' : ' or ';
  return rule.conditions
    .map((condition) => describeCondition(condition, meta, categoryLabel))
    .join(joiner);
};

/**
 * A rule key is its identity in the API and in the Custom Object store, so
 * it is derived once from the name and then never changes — renaming a rule
 * must not orphan its run history.
 */
export const toRuleKey = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slug || 'rule'}-${suffix}`;
};

export const emptyCondition = (meta?: Meta): Condition => {
  const first = meta?.fields[0];
  return {
    field: first?.field ?? { kind: 'name', valueKind: 'text' },
    operator: first?.operators[0] ?? 'contains',
    value: '',
  };
};

export const percentComplete = (
  scanned: number,
  total?: number
): number | undefined => {
  if (!total || total <= 0) return undefined;
  return Math.min(100, Math.round((scanned / total) * 100));
};

export const formatDateTime = (iso?: string): string =>
  iso ? new Date(iso).toLocaleString() : '—';
