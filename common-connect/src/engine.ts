/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type {
  Attribute,
  LocalizedString,
  ProductProjection,
  ProductVariant,
} from '@commercetools/platform-sdk';
import {
  Condition,
  EvaluationContext,
  FieldRef,
  NEGATED_OPERATORS,
  NULLARY_OPERATORS,
  Operator,
  Rule,
} from './types';

/**
 * The matching engine: does this product satisfy this rule?
 *
 * Pure and synchronous — it reads a Product Projection already in hand and
 * never calls the API. That is what lets the same code decide one product's
 * fate inside a 10-second event acknowledgement and decide the whole
 * catalog's inside a sweep.
 */

const DEFAULT_FRACTION_DIGITS = 2;

/** Every value a field yields for one product. A SKU field yields one per variant. */
export function readField(
  product: ProductProjection,
  field: FieldRef,
  ctx: EvaluationContext
): unknown[] {
  switch (field.kind) {
    case 'name':
      return localizedValues(product.name, field.locale);
    case 'slug':
      return localizedValues(product.slug, field.locale);
    case 'description':
      return localizedValues(product.description, field.locale);
    case 'key':
      return present(product.key);
    case 'sku':
      return allVariants(product).flatMap((variant) => present(variant.sku));
    case 'productType':
      return present(ctx.productTypeKeyById[product.productType.id]);
    case 'price':
      return priceValues(product, field, ctx);
    case 'createdAt':
      return present(product.createdAt);
    case 'lastModifiedAt':
      return present(product.lastModifiedAt);
    case 'category':
      return product.categories.map((category) => category.id);
    case 'attribute':
      return attributeValues(product, field.attributeName);
  }
}

export function evaluateCondition(
  product: ProductProjection,
  condition: Condition,
  ctx: EvaluationContext
): boolean {
  const values = readField(product, condition.field, ctx);

  if (condition.operator === 'isEmpty') return values.length === 0;
  if (condition.operator === 'isNotEmpty') return values.length > 0;

  const negatedFrom = NEGATED_OPERATORS[condition.operator];
  if (negatedFrom) {
    // "does not contain" holds only when no candidate value contains it.
    return !values.some((value) =>
      applyOperator(value, negatedFrom, condition.value, ctx)
    );
  }

  return values.some((value) =>
    applyOperator(value, condition.operator, condition.value, ctx)
  );
}

export function evaluateRule(
  product: ProductProjection,
  rule: Rule,
  ctx: EvaluationContext
): boolean {
  // A rule with no conditions matches nothing. The alternative — matching the
  // whole catalog — is the more expensive mistake to make by accident.
  if (rule.conditions.length === 0) return false;

  return rule.match === 'all'
    ? rule.conditions.every((c) => evaluateCondition(product, c, ctx))
    : rule.conditions.some((c) => evaluateCondition(product, c, ctx));
}

function applyOperator(
  actual: unknown,
  operator: Operator,
  expected: Condition['value'],
  ctx: EvaluationContext
): boolean {
  switch (operator) {
    case 'equals':
      return looseEquals(actual, expected);
    case 'startsWith':
      return text(actual).startsWith(text(expected));
    case 'endsWith':
      return text(actual).endsWith(text(expected));
    case 'contains':
      return text(actual).includes(text(expected));
    case 'matchesRegex':
      // The pattern is passed through as written. Lower-casing it would
      // invert every negated character class — \D becomes \d, \W becomes
      // \w, \S becomes \s, \B becomes \b — and the rule would quietly
      // match the opposite of what it says. Case-insensitivity comes from
      // the `i` flag, which is where it belongs.
      return safeRegexTest(String(expected ?? ''), String(actual ?? ''));
    case 'greaterThan':
      return compareNumbers(actual, expected, (a, b) => a > b);
    case 'greaterOrEqual':
      return compareNumbers(actual, expected, (a, b) => a >= b);
    case 'lessThan':
      return compareNumbers(actual, expected, (a, b) => a < b);
    case 'lessOrEqual':
      return compareNumbers(actual, expected, (a, b) => a <= b);
    case 'isTrue':
      return actual === true;
    case 'isFalse':
      return actual === false;
    case 'withinLastHours':
      return withinLast(actual, Number(expected) * 3_600_000, ctx.now);
    case 'withinLastDays':
      return withinLast(actual, Number(expected) * 86_400_000, ctx.now);
    case 'before':
      return compareDates(actual, expected, (a, b) => a < b);
    case 'after':
      return compareDates(actual, expected, (a, b) => a > b);
    case 'inCategory':
      return String(actual) === String(expected);
    default:
      // Negated and nullary operators are resolved before they reach here.
      return false;
  }
}

/** Case-insensitive for text so a merchandiser is not caught out by casing. */
function text(value: unknown): string {
  return String(value ?? '').toLowerCase();
}

function looseEquals(actual: unknown, expected: Condition['value']): boolean {
  if (typeof actual === 'number' || typeof expected === 'number') {
    return Number(actual) === Number(expected);
  }
  if (typeof actual === 'boolean' || typeof expected === 'boolean') {
    return Boolean(actual) === Boolean(expected);
  }
  return text(actual) === text(expected);
}

function compareNumbers(
  actual: unknown,
  expected: Condition['value'],
  compare: (a: number, b: number) => boolean
): boolean {
  const a = Number(actual);
  const b = Number(expected);
  return Number.isFinite(a) && Number.isFinite(b) && compare(a, b);
}

function compareDates(
  actual: unknown,
  expected: Condition['value'],
  compare: (a: number, b: number) => boolean
): boolean {
  const a = Date.parse(String(actual));
  const b = Date.parse(String(expected));
  return Number.isFinite(a) && Number.isFinite(b) && compare(a, b);
}

function withinLast(actual: unknown, windowMs: number, now: Date): boolean {
  const at = Date.parse(String(actual));
  if (!Number.isFinite(at) || !Number.isFinite(windowMs) || windowMs <= 0) {
    return false;
  }
  const age = now.getTime() - at;
  return age >= 0 && age <= windowMs;
}

/**
 * A rule is merchandiser-authored input, so a pathological pattern is a real
 * possibility. Treat an invalid pattern as no match rather than letting it
 * take down the sweep.
 */
/**
 * A rule's pattern, applied case-insensitively like every other text
 * operator. A pattern that will not compile matches nothing rather than
 * failing the product write it is being evaluated inside.
 */
function safeRegexTest(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern, 'i').test(value);
  } catch {
    return false;
  }
}

function present<T>(value: T | undefined | null): T[] {
  return value === undefined || value === null ? [] : [value];
}

function localizedValues(
  value: LocalizedString | undefined,
  locale?: string
): string[] {
  if (!value) return [];
  if (locale) return present(value[locale]);
  return Object.values(value).filter((v): v is string => typeof v === 'string');
}

function allVariants(product: ProductProjection): ProductVariant[] {
  return [product.masterVariant, ...(product.variants ?? [])];
}

function priceValues(
  product: ProductProjection,
  field: FieldRef,
  ctx: EvaluationContext
): number[] {
  const currency = field.currency ?? ctx.defaultCurrency;
  const digits: number =
    (currency ? ctx.fractionDigitsByCurrency?.[currency] : undefined) ??
    DEFAULT_FRACTION_DIGITS;

  return allVariants(product)
    .flatMap((variant) => variant.prices ?? [])
    .filter((price) => !currency || price.value.currencyCode === currency)
    .map((price) => price.value.centAmount / Math.pow(10, digits));
}

/**
 * Attribute values, flattened to primitives a condition can compare against.
 * Enums contribute both key and label so a rule can name either, and a set
 * contributes each of its members.
 */
function attributeValues(
  product: ProductProjection,
  attributeName?: string
): unknown[] {
  if (!attributeName) return [];

  return allVariants(product)
    .flatMap((variant) => variant.attributes ?? [])
    .filter((attribute: Attribute) => attribute.name === attributeName)
    .flatMap((attribute: Attribute) => flattenAttributeValue(attribute.value));
}

function flattenAttributeValue(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(flattenAttributeValue);

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;

    // Enum / localized enum.
    if ('key' in record) {
      return [record.key, ...flattenAttributeValue(record.label)];
    }
    // Money.
    if ('centAmount' in record) {
      const digits: number =
        typeof record.fractionDigits === 'number'
          ? record.fractionDigits
          : DEFAULT_FRACTION_DIGITS;
      return [Number(record.centAmount) / Math.pow(10, digits)];
    }
    // Reference.
    if ('id' in record && 'typeId' in record) {
      return [record.id];
    }
    // Localized string.
    return Object.values(record).filter((v) => typeof v === 'string');
  }

  return [value];
}

export { NULLARY_OPERATORS };
