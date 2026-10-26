/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * The shapes the rules API speaks.
 *
 * Mirrored here rather than imported from the connector's shared module:
 * these two surfaces are pure HTTP clients, and keeping them that way means
 * the Merchant Center bundle has no build-time coupling to the backend
 * applications at all. The field catalog, the operators and their labels
 * all arrive at runtime from /meta, so the only thing that has to stay in
 * step is this file and the wire format.
 */

export type ValueKind = 'text' | 'number' | 'boolean' | 'date' | 'category';

export type FieldRef = {
  kind: string;
  valueKind: ValueKind;
  attributeName?: string;
  locale?: string;
  currency?: string;
};

export type Condition = {
  field: FieldRef;
  operator: string;
  value?: string | number | boolean;
};

export type Rule = {
  key: string;
  name: string;
  categoryId: string;
  enabled: boolean;
  match: 'all' | 'any';
  conditions: Condition[];
  removeWhenNoLongerMatching: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FieldOption = {
  id: string;
  label: string;
  group: string;
  field: FieldRef;
  operators: string[];
  choices?: { value: string; label: string }[];
};

export type Meta = {
  fields: FieldOption[];
  operatorsByValueKind: Record<ValueKind, string[]>;
  operatorLabels: Record<string, string>;
  languages: string[];
  currencies: string[];
};

export type SweepTotals = {
  scanned: number;
  productsChanged: number;
  added: number;
  removed: number;
};

export type ProductChange = {
  productId: string;
  productKey?: string;
  added: string[];
  removed: string[];
};

export type RunResponse = {
  cursor?: string;
  done: boolean;
  totals: SweepTotals;
  sample: ProductChange[];
  startedAt: string;
};

export type RunSummary = {
  target: string;
  scope: 'rule' | 'category' | 'all';
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  totals: SweepTotals;
  sample: ProductChange[];
  cursor?: string;
  complete?: boolean;
};

/** Operators that take no value of their own. */
export const NULLARY_OPERATORS = [
  'isEmpty',
  'isNotEmpty',
  'isTrue',
  'isFalse',
];
