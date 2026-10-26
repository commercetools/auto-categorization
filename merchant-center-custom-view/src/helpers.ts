/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Condition, FieldOption, Meta, Rule } from './api/types';
import { NULLARY_OPERATORS } from './api/types';

/** Where the rules API lives, as Connect wired it in at deploy time. */
export const rulesApiUrl = (): string => {
  const app = (window as unknown as { app?: { rulesApiUrl?: string } }).app;
  const url = app?.rulesApiUrl;
  if (!url) {
    throw new Error(
      'RULES_API_URL is not configured. Set it on the deployment to the rules-api application URL.'
    );
  }
  return `${url.replace(/\/$/, '')}/rules-api`;
};

/**
 * Which category the merchandiser is looking at.
 *
 * A Custom View has no route of its own — it renders inside a built-in
 * page — so the only thing that says which category this is, is the host
 * application's own URL, which the shell hands over as `hostUrl`. The
 * category details route is `/{projectKey}/categories/{id}/...`, and the
 * id is a UUID, so it is picked out by shape rather than by position: the
 * tab a user happens to be on must not change the answer.
 */
const UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export const categoryIdFromHostUrl = (hostUrl?: string): string | undefined => {
  if (!hostUrl) return undefined;

  const path = hostUrl.split('?')[0];
  const afterCategories = path.split('/categories/')[1];
  if (!afterCategories) return undefined;

  const match = afterCategories.match(UUID);
  return match?.[0];
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

export const describeCondition = (
  condition: Condition,
  meta?: Meta
): string => {
  const field = fieldOptionFor(meta, condition)?.label ?? condition.field.kind;
  const operator =
    meta?.operatorLabels?.[condition.operator] ?? condition.operator;

  if (NULLARY_OPERATORS.includes(condition.operator)) {
    return `${field} ${operator}`;
  }

  return `${field} ${operator} ${String(condition.value)}`;
};

export const describeRule = (rule: Rule, meta?: Meta): string => {
  const joiner = rule.match === 'all' ? ' and ' : ' or ';
  return rule.conditions
    .map((condition) => describeCondition(condition, meta))
    .join(joiner);
};

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

export const formatDateTime = (iso?: string): string =>
  iso ? new Date(iso).toLocaleString() : '—';
