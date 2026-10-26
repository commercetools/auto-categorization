/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * The rule model.
 *
 * A rule says: "products matching these conditions belong in this category."
 * Membership of a category that has rules is computed, not curated — the same
 * contract a merchandiser already knows from automated collections elsewhere.
 * Everything downstream (the matching engine, the Merchant Center builder, the
 * catalog sweep) is driven by these shapes, so they are the one place to look
 * when adding a field or an operator.
 */

/** How a rule combines its conditions. */
export type MatchMode = 'all' | 'any';

/**
 * The kind of value a field yields, which is what decides the operators a
 * merchandiser is offered for it.
 */
export type ValueKind = 'text' | 'number' | 'boolean' | 'date' | 'category';

export const TEXT_OPERATORS = [
  'equals',
  'notEquals',
  'startsWith',
  'endsWith',
  'contains',
  'notContains',
  'matchesRegex',
  'isEmpty',
  'isNotEmpty',
] as const;

export const NUMBER_OPERATORS = [
  'equals',
  'notEquals',
  'greaterThan',
  'greaterOrEqual',
  'lessThan',
  'lessOrEqual',
] as const;

export const BOOLEAN_OPERATORS = ['isTrue', 'isFalse'] as const;

export const DATE_OPERATORS = [
  'withinLastHours',
  'withinLastDays',
  'before',
  'after',
] as const;

export const CATEGORY_OPERATORS = ['inCategory', 'notInCategory'] as const;

export type TextOperator = (typeof TEXT_OPERATORS)[number];
export type NumberOperator = (typeof NUMBER_OPERATORS)[number];
export type BooleanOperator = (typeof BOOLEAN_OPERATORS)[number];
export type DateOperator = (typeof DATE_OPERATORS)[number];
export type CategoryOperator = (typeof CATEGORY_OPERATORS)[number];

export type Operator =
  | TextOperator
  | NumberOperator
  | BooleanOperator
  | DateOperator
  | CategoryOperator;

export const OPERATORS_BY_VALUE_KIND: Record<ValueKind, readonly Operator[]> = {
  text: TEXT_OPERATORS,
  number: NUMBER_OPERATORS,
  boolean: BOOLEAN_OPERATORS,
  date: DATE_OPERATORS,
  category: CATEGORY_OPERATORS,
};

/** Operators that take no value of their own. */
export const NULLARY_OPERATORS: readonly Operator[] = [
  'isEmpty',
  'isNotEmpty',
  'isTrue',
  'isFalse',
];

/**
 * Operators phrased as a negation. The engine evaluates the positive form
 * against every candidate value a field yields and then inverts, so
 * "SKU does not contain X" means no variant's SKU contains X.
 */
export const NEGATED_OPERATORS: Partial<Record<Operator, Operator>> = {
  notEquals: 'equals',
  notContains: 'contains',
  notInCategory: 'inCategory',
};

/** Which part of a Product a condition reads. */
export type FieldKind =
  | 'name'
  | 'slug'
  | 'description'
  | 'key'
  | 'sku'
  | 'productType'
  | 'price'
  | 'createdAt'
  | 'lastModifiedAt'
  | 'category'
  | 'attribute';

export type FieldRef = {
  kind: FieldKind;
  valueKind: ValueKind;
  /** Required when `kind` is `attribute`. */
  attributeName?: string;
  /** Localized fields read every locale when this is absent. */
  locale?: string;
  /** Price fields read the Project's first currency when this is absent. */
  currency?: string;
};

export type Condition = {
  field: FieldRef;
  operator: Operator;
  value?: string | number | boolean;
};

export type Rule = {
  /** Custom Object key; also the rule's identity in the API and the UI. */
  key: string;
  name: string;
  /** The category this rule fills. */
  categoryId: string;
  enabled: boolean;
  match: MatchMode;
  conditions: Condition[];
  /**
   * Take the category away again when a product stops matching. On by
   * default: a category with rules has computed membership, and a product
   * that no longer qualifies does not belong in it.
   */
  removeWhenNoLongerMatching: boolean;
  createdAt: string;
  updatedAt: string;
};

/** A rule as it arrives from the Merchant Center, before validation. */
export type RuleDraft = Omit<Rule, 'createdAt' | 'updatedAt'> &
  Partial<Pick<Rule, 'createdAt' | 'updatedAt'>>;

/** One selectable field in the rule builder. */
export type FieldOption = {
  id: string;
  label: string;
  group: string;
  field: FieldRef;
  operators: readonly Operator[];
  /** Fixed choices, for enum attributes and booleans. */
  choices?: { value: string; label: string }[];
};

/** What the matching engine needs beyond the product itself. */
export type EvaluationContext = {
  now: Date;
  /** Product type id to key, so rules can name a product type a human typed. */
  productTypeKeyById: Record<string, string>;
  /** Currency used when a price condition does not name one. */
  defaultCurrency?: string;
  /** Fraction digits per currency, so rule values stay in major units. */
  fractionDigitsByCurrency?: Record<string, number>;
};

export type ProductChange = {
  productId: string;
  productKey?: string;
  added: string[];
  removed: string[];
};

export type SweepTotals = {
  scanned: number;
  productsChanged: number;
  added: number;
  removed: number;
};

export type RunSummary = {
  /** Rule key, or the category id for a whole-category run. */
  target: string;
  scope: 'rule' | 'category' | 'all';
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  totals: SweepTotals;
  /** A short tail of what changed, for the Merchant Center to show. */
  sample: ProductChange[];
  /** Where an unfinished pass stopped, so the next one resumes there. */
  cursor?: string;
  /** Absent while a pass is still walking the catalog. */
  complete?: boolean;
  error?: string;
};
