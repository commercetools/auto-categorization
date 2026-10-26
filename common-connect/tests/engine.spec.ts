/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ProductProjection } from '@commercetools/platform-sdk';
import { evaluateCondition, evaluateRule, readField } from '../src/engine';
import { planProduct } from '../src/reconcile';
import { Condition, EvaluationContext, Rule } from '../src/types';

const NOW = new Date('2026-09-28T12:00:00.000Z');

const ctx: EvaluationContext = {
  now: NOW,
  productTypeKeyById: { 'pt-1': 'sample-general' },
  defaultCurrency: 'USD',
  fractionDigitsByCurrency: { USD: 2 },
};

function product(overrides: Partial<ProductProjection> = {}): ProductProjection {
  return {
    id: 'p-1',
    version: 7,
    key: 'ramp-9x72',
    createdAt: '2026-09-26T09:00:00.000Z',
    lastModifiedAt: '2026-09-27T09:00:00.000Z',
    published: true,
    hasStagedChanges: false,
    productType: { typeId: 'product-type', id: 'pt-1' },
    name: { 'en-US': '9" x 72" 1000 Lb Aluminum Loading Ramps' },
    slug: { 'en-US': 'aluminum-loading-ramps' },
    categories: [],
    masterVariant: {
      id: 1,
      sku: 'ABC-18693487',
      prices: [
        {
          id: 'price-1',
          value: {
            type: 'centPrecision',
            currencyCode: 'USD',
            centAmount: 21999,
            fractionDigits: 2,
          },
        },
      ],
      attributes: [
        { name: 'brand', value: 'Erickson' },
        { name: 'unit-count', value: 24 },
        { name: 'bopis-eligible', value: true },
        { name: 'animal', value: ['dog', 'cat'] },
      ],
    },
    variants: [],
    ...overrides,
  } as ProductProjection;
}

function rule(conditions: Condition[], overrides: Partial<Rule> = {}): Rule {
  return {
    key: 'r-1',
    name: 'Test rule',
    categoryId: 'cat-new',
    enabled: true,
    match: 'all',
    conditions,
    removeWhenNoLongerMatching: true,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

const textField = { kind: 'name', valueKind: 'text' } as const;
const skuField = { kind: 'sku', valueKind: 'text' } as const;
const createdField = { kind: 'createdAt', valueKind: 'date' } as const;
const priceField = { kind: 'price', valueKind: 'number' } as const;

describe('readField', () => {
  it('reads every locale of a localized field when none is named', () => {
    const p = product({ name: { 'en-US': 'Ramps', 'de-DE': 'Rampen' } });
    expect(readField(p, textField, ctx)).toEqual(['Ramps', 'Rampen']);
  });

  it('reads the named locale only', () => {
    const p = product({ name: { 'en-US': 'Ramps', 'de-DE': 'Rampen' } });
    expect(readField(p, { ...textField, locale: 'de-DE' }, ctx)).toEqual([
      'Rampen',
    ]);
  });

  it('reads a SKU from every variant', () => {
    const p = product({
      variants: [{ id: 2, sku: 'ABC-2' }, { id: 3, sku: 'XYZ-3' }],
    } as Partial<ProductProjection>);
    expect(readField(p, skuField, ctx)).toEqual([
      'ABC-18693487',
      'ABC-2',
      'XYZ-3',
    ]);
  });

  it('reads price in major units', () => {
    expect(readField(product(), priceField, ctx)).toEqual([219.99]);
  });

  it('resolves a product type to its key', () => {
    expect(
      readField(product(), { kind: 'productType', valueKind: 'text' }, ctx)
    ).toEqual(['sample-general']);
  });

  it('flattens a set attribute into its members', () => {
    expect(
      readField(
        product(),
        { kind: 'attribute', attributeName: 'animal', valueKind: 'text' },
        ctx
      )
    ).toEqual(['dog', 'cat']);
  });

  it('yields nothing for an attribute the product does not carry', () => {
    expect(
      readField(
        product(),
        { kind: 'attribute', attributeName: 'weight', valueKind: 'number' },
        ctx
      )
    ).toEqual([]);
  });
});

describe('text operators', () => {
  const cases: Array<[Condition['operator'], string, boolean]> = [
    ['startsWith', '9"', true],
    ['startsWith', 'ramp', false],
    ['endsWith', 'ramps', true],
    ['contains', 'aluminum', true],
    ['contains', 'steel', false],
    ['notContains', 'steel', true],
    ['notContains', 'aluminum', false],
    ['equals', '9" X 72" 1000 LB ALUMINUM LOADING RAMPS', true],
    ['notEquals', 'something else', true],
    ['matchesRegex', '^\\d+" x \\d+"', true],
    ['matchesRegex', '^ramp', false],
  ];

  it.each(cases)('%s "%s" -> %s', (operator, value, expected) => {
    expect(
      evaluateCondition(product(), { field: textField, operator, value }, ctx)
    ).toBe(expected);
  });

  it('matches case-insensitively', () => {
    expect(
      evaluateCondition(
        product(),
        { field: skuField, operator: 'startsWith', value: 'abc' },
        ctx
      )
    ).toBe(true);
  });

  /**
   * The pattern reaches RegExp as written. Lower-casing it inverted every
   * negated class, so `\D` silently became `\d` and a rule matched the
   * opposite of what it said. Measured against the live catalog before the
   * fix: `\D` and `\d` returned the same 228 products out of 407.
   */
  it.each([
    ['\\d', false],
    ['\\D', true],
    ['\\w', true],
    ['\\W', true],
    ['\\s', true],
    ['\\S', true],
  ] as [string, boolean][])(
    'keeps the case of the pattern, so /%s/ means what it says',
    (pattern, expected) => {
      // "Aluminum" — letters and spaces, no digits.
      const p = product({ name: { en: 'Aluminum Ramp' } } as Partial<ProductProjection>);
      expect(
        evaluateCondition(
          p,
          { field: textField, operator: 'matchesRegex', value: pattern },
          ctx
        )
      ).toBe(expected);
    }
  );

  it('still ignores case in the value it is matching', () => {
    expect(
      evaluateCondition(
        product(),
        { field: textField, operator: 'matchesRegex', value: '^ALUMINUM|^9' },
        ctx
      )
    ).toBe(true);
  });

  it('treats an unparseable regular expression as no match', () => {
    expect(
      evaluateCondition(
        product(),
        { field: textField, operator: 'matchesRegex', value: '([' },
        ctx
      )
    ).toBe(false);
  });

  it('holds "does not contain" only when no variant SKU contains it', () => {
    const p = product({
      variants: [{ id: 2, sku: 'XYZ-2' }],
    } as Partial<ProductProjection>);
    expect(
      evaluateCondition(
        p,
        { field: skuField, operator: 'notContains', value: 'XYZ' },
        ctx
      )
    ).toBe(false);
  });
});

describe('number, boolean and date operators', () => {
  const numberField = {
    kind: 'attribute',
    attributeName: 'unit-count',
    valueKind: 'number',
  } as const;

  it.each([
    ['greaterThan', 20, true],
    ['greaterThan', 24, false],
    ['greaterOrEqual', 24, true],
    ['lessThan', 25, true],
    ['lessOrEqual', 23, false],
    ['equals', 24, true],
  ] as Array<[Condition['operator'], number, boolean]>)(
    '%s %s -> %s',
    (operator, value, expected) => {
      expect(
        evaluateCondition(product(), { field: numberField, operator, value }, ctx)
      ).toBe(expected);
    }
  );

  it('compares price in major units', () => {
    expect(
      evaluateCondition(
        product(),
        { field: priceField, operator: 'greaterThan', value: 200 },
        ctx
      )
    ).toBe(true);
    expect(
      evaluateCondition(
        product(),
        { field: priceField, operator: 'greaterThan', value: 21998 },
        ctx
      )
    ).toBe(false);
  });

  it('reads a boolean attribute', () => {
    const field = {
      kind: 'attribute',
      attributeName: 'bopis-eligible',
      valueKind: 'boolean',
    } as const;
    expect(
      evaluateCondition(product(), { field, operator: 'isTrue' }, ctx)
    ).toBe(true);
    expect(
      evaluateCondition(product(), { field, operator: 'isFalse' }, ctx)
    ).toBe(false);
  });

  it('matches a product created inside the window', () => {
    expect(
      evaluateCondition(
        product(),
        { field: createdField, operator: 'withinLastDays', value: 7 },
        ctx
      )
    ).toBe(true);
  });

  it('does not match a product created before the window', () => {
    expect(
      evaluateCondition(
        product({ createdAt: '2026-08-01T09:00:00.000Z' }),
        { field: createdField, operator: 'withinLastDays', value: 7 },
        ctx
      )
    ).toBe(false);
  });

  it('does not match a product created in the future', () => {
    expect(
      evaluateCondition(
        product({ createdAt: '2026-10-05T09:00:00.000Z' }),
        { field: createdField, operator: 'withinLastDays', value: 7 },
        ctx
      )
    ).toBe(false);
  });

  it('honours before and after', () => {
    expect(
      evaluateCondition(
        product(),
        { field: createdField, operator: 'after', value: '2026-09-01' },
        ctx
      )
    ).toBe(true);
    expect(
      evaluateCondition(
        product(),
        { field: createdField, operator: 'before', value: '2026-09-01' },
        ctx
      )
    ).toBe(false);
  });
});

describe('isEmpty and isNotEmpty', () => {
  it('is empty when the product carries no such attribute', () => {
    const field = {
      kind: 'attribute',
      attributeName: 'video-url',
      valueKind: 'text',
    } as const;
    expect(
      evaluateCondition(product(), { field, operator: 'isEmpty' }, ctx)
    ).toBe(true);
    expect(
      evaluateCondition(product(), { field, operator: 'isNotEmpty' }, ctx)
    ).toBe(false);
  });
});

describe('evaluateRule', () => {
  const startsWith9: Condition = {
    field: textField,
    operator: 'startsWith',
    value: '9"',
  };
  const skuAbc: Condition = {
    field: skuField,
    operator: 'startsWith',
    value: 'ABC',
  };
  const skuZzz: Condition = {
    field: skuField,
    operator: 'startsWith',
    value: 'ZZZ',
  };

  it('requires every condition when match is all', () => {
    expect(evaluateRule(product(), rule([startsWith9, skuAbc]), ctx)).toBe(true);
    expect(evaluateRule(product(), rule([startsWith9, skuZzz]), ctx)).toBe(
      false
    );
  });

  it('requires one condition when match is any', () => {
    expect(
      evaluateRule(product(), rule([startsWith9, skuZzz], { match: 'any' }), ctx)
    ).toBe(true);
    expect(
      evaluateRule(product(), rule([skuZzz], { match: 'any' }), ctx)
    ).toBe(false);
  });

  it('matches nothing when a rule has no conditions', () => {
    expect(evaluateRule(product(), rule([]), ctx)).toBe(false);
  });
});

describe('planProduct', () => {
  const newProducts = rule(
    [{ field: createdField, operator: 'withinLastDays', value: 7 }],
    { key: 'new-products', categoryId: 'cat-new' }
  );

  it('adds the category to a matching product that is not in it', () => {
    const plan = planProduct(product(), [newProducts], ctx);
    expect(plan.added).toEqual(['cat-new']);
    expect(plan.removed).toEqual([]);
    expect(plan.actions).toEqual([
      {
        action: 'addToCategory',
        category: { typeId: 'category', id: 'cat-new' },
        staged: false,
      },
    ]);
  });

  it('writes nothing when the product is already where it belongs', () => {
    const p = product({
      categories: [{ typeId: 'category', id: 'cat-new' }],
    });
    expect(planProduct(p, [newProducts], ctx).actions).toEqual([]);
  });

  it('removes the category when the product stops matching', () => {
    const p = product({
      createdAt: '2026-01-01T00:00:00.000Z',
      categories: [{ typeId: 'category', id: 'cat-new' }],
    });
    const plan = planProduct(p, [newProducts], ctx);
    expect(plan.removed).toEqual(['cat-new']);
    expect(plan.actions[0]).toEqual({
      action: 'removeFromCategory',
      category: { typeId: 'category', id: 'cat-new' },
      staged: false,
    });
  });

  it('leaves the category alone when the rule does not remove', () => {
    const p = product({
      createdAt: '2026-01-01T00:00:00.000Z',
      categories: [{ typeId: 'category', id: 'cat-new' }],
    });
    const keeper = { ...newProducts, removeWhenNoLongerMatching: false };
    expect(planProduct(p, [keeper], ctx).actions).toEqual([]);
  });

  it('never touches a category no rule names', () => {
    const p = product({
      createdAt: '2026-01-01T00:00:00.000Z',
      categories: [
        { typeId: 'category', id: 'cat-manual' },
        { typeId: 'category', id: 'cat-new' },
      ],
    });
    const plan = planProduct(p, [newProducts], ctx);
    expect(plan.removed).toEqual(['cat-new']);
    expect(plan.added).toEqual([]);
  });

  it('ignores a disabled rule, and so leaves its category unmanaged', () => {
    const p = product({
      createdAt: '2026-01-01T00:00:00.000Z',
      categories: [{ typeId: 'category', id: 'cat-new' }],
    });
    const disabled = { ...newProducts, enabled: false };
    expect(planProduct(p, [disabled], ctx).actions).toEqual([]);
  });

  it('keeps a product that any one rule on the category claims', () => {
    const p = product({
      createdAt: '2026-01-01T00:00:00.000Z',
      categories: [{ typeId: 'category', id: 'cat-new' }],
    });
    const second = rule([{ field: skuField, operator: 'startsWith', value: 'ABC' }], {
      key: 'abc-skus',
      categoryId: 'cat-new',
    });
    expect(planProduct(p, [newProducts, second], ctx).actions).toEqual([]);
  });
});
