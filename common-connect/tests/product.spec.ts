/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Product, ProductProjection } from '@commercetools/platform-sdk';
import { projectionFromProduct, stagedFlagFor } from '../src/product';
import { planProduct } from '../src/reconcile';
import { EvaluationContext, Rule } from '../src/types';

const NOW = new Date('2026-09-28T12:00:00.000Z');

const ctx: EvaluationContext = {
  now: NOW,
  productTypeKeyById: { 'pt-1': 'sample-general' },
  defaultCurrency: 'USD',
  fractionDigitsByCurrency: { USD: 2 },
};

const newProducts: Rule = {
  key: 'new-products',
  name: 'New products',
  categoryId: 'cat-new',
  enabled: true,
  match: 'all',
  conditions: [
    {
      field: { kind: 'createdAt', valueKind: 'date' },
      operator: 'withinLastDays',
      value: 7,
    },
  ],
  removeWhenNoLongerMatching: true,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
};

function data(name: string, categories: string[] = []) {
  return {
    name: { 'en-US': name },
    slug: { 'en-US': 'slug' },
    categories: categories.map((id) => ({ typeId: 'category', id })),
    masterVariant: { id: 1, sku: 'ABC-1' },
    variants: [],
    searchKeywords: {},
  };
}

function fullProduct(overrides: Partial<Product['masterData']> = {}): Product {
  return {
    id: 'p-1',
    version: 3,
    key: 'ramp',
    createdAt: '2026-09-26T09:00:00.000Z',
    lastModifiedAt: '2026-09-27T09:00:00.000Z',
    productType: { typeId: 'product-type', id: 'pt-1' },
    masterData: {
      published: true,
      hasStagedChanges: false,
      current: data('Published name'),
      staged: data('Staged name'),
      ...overrides,
    },
  } as unknown as Product;
}

describe('projectionFromProduct', () => {
  it('reads the staged projection by default', () => {
    const projection = projectionFromProduct(fullProduct());
    expect(projection.name).toEqual({ 'en-US': 'Staged name' });
  });

  it('reads the current projection on request', () => {
    const projection = projectionFromProduct(fullProduct(), 'current');
    expect(projection.name).toEqual({ 'en-US': 'Published name' });
  });

  it('carries the product-level fields a rule can read', () => {
    const projection = projectionFromProduct(fullProduct());
    expect(projection.id).toBe('p-1');
    expect(projection.version).toBe(3);
    expect(projection.key).toBe('ramp');
    expect(projection.createdAt).toBe('2026-09-26T09:00:00.000Z');
    expect(projection.productType).toEqual({
      typeId: 'product-type',
      id: 'pt-1',
    });
    expect(projection.published).toBe(true);
    expect(projection.hasStagedChanges).toBe(false);
  });

  it('feeds the engine directly', () => {
    const plan = planProduct(
      projectionFromProduct(fullProduct()),
      [newProducts],
      ctx
    );
    expect(plan.added).toEqual(['cat-new']);
  });
});

describe('stagedFlagFor', () => {
  it('writes both projections for a published product in step', () => {
    expect(stagedFlagFor({ published: true, hasStagedChanges: false })).toBe(
      false
    );
  });

  it('writes staged only while an edit is pending', () => {
    expect(stagedFlagFor({ published: true, hasStagedChanges: true })).toBe(
      true
    );
  });

  it('writes staged only for an unpublished product', () => {
    expect(stagedFlagFor({ published: false, hasStagedChanges: false })).toBe(
      true
    );
  });
});

describe('planProduct staging', () => {
  it.each([
    [true, false, false],
    [true, true, true],
    [false, false, true],
  ])(
    'published=%s hasStagedChanges=%s -> staged=%s',
    (published, hasStagedChanges, expected) => {
      const projection = {
        ...projectionFromProduct(fullProduct()),
        published,
        hasStagedChanges,
      } as ProductProjection;

      const plan = planProduct(projection, [newProducts], ctx);
      expect(plan.staged).toBe(expected);
      expect(plan.actions[0]).toMatchObject({ staged: expected });
    }
  );
});
