/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Product } from '@commercetools/platform-sdk';
import type { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import { EvaluationContext, Rule } from '../src/shared';
import {
  BadExtensionInputError,
  createRuleLoader,
  decideActions,
  parseExtensionInput,
} from '../src/handlers/extension.handler';

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

function data(categories: string[] = []) {
  return {
    name: { 'en-US': 'Aluminum Loading Ramps' },
    slug: { 'en-US': 'ramps' },
    categories: categories.map((id) => ({ typeId: 'category', id })),
    masterVariant: { id: 1, sku: 'ABC-1' },
    variants: [],
    searchKeywords: {},
  };
}

function product(overrides: Record<string, unknown> = {}): Product {
  return {
    id: 'p-1',
    version: 1,
    createdAt: '2026-09-27T09:00:00.000Z',
    lastModifiedAt: '2026-09-27T09:00:00.000Z',
    productType: { typeId: 'product-type', id: 'pt-1' },
    masterData: {
      published: true,
      hasStagedChanges: false,
      current: data(),
      staged: data(),
    },
    ...overrides,
  } as unknown as Product;
}

function input(obj: Product, action: 'Create' | 'Update' = 'Update') {
  return { action, resource: { typeId: 'product', id: obj.id, obj } };
}

const loadCtx = async () => ctx;

describe('parseExtensionInput', () => {
  it('accepts a product create and a product update', () => {
    expect(parseExtensionInput(input(product(), 'Create')).action).toBe(
      'Create'
    );
    expect(parseExtensionInput(input(product(), 'Update')).action).toBe(
      'Update'
    );
  });

  it.each([
    [undefined, 'action must be'],
    [{}, 'action must be'],
    [{ action: 'Delete', resource: { typeId: 'product', id: 'x' } }, 'action must be'],
    [{ action: 'Update' }, 'no resource reference'],
    [
      { action: 'Update', resource: { typeId: 'cart', id: 'c-1', obj: {} } },
      'is not product',
    ],
    [
      { action: 'Update', resource: { typeId: 'product', id: 'p-1' } },
      'no product in the payload',
    ],
  ])('rejects %j', (body, fragment) => {
    expect(() => parseExtensionInput(body)).toThrow(BadExtensionInputError);
    try {
      parseExtensionInput(body);
    } catch (error) {
      expect((error as Error).message).toContain(fragment as string);
    }
  });
});

describe('decideActions', () => {
  it('returns the category assignment for a matching product', async () => {
    const outcome = await decideActions(
      input(product()),
      async () => [newProducts],
      loadCtx
    );

    expect(outcome.added).toEqual(['cat-new']);
    expect(outcome.actions).toEqual([
      {
        action: 'addToCategory',
        category: { typeId: 'category', id: 'cat-new' },
        staged: false,
      },
    ]);
  });

  it('returns nothing when the product is already in the category', async () => {
    const already = product({
      masterData: {
        published: true,
        hasStagedChanges: false,
        current: data(['cat-new']),
        staged: data(['cat-new']),
      },
    });

    const outcome = await decideActions(
      input(already),
      async () => [newProducts],
      loadCtx
    );

    expect(outcome.actions).toEqual([]);
  });

  it('takes the category back when the product stops matching', async () => {
    const aged = product({
      createdAt: '2026-01-01T00:00:00.000Z',
      masterData: {
        published: true,
        hasStagedChanges: false,
        current: data(['cat-new']),
        staged: data(['cat-new']),
      },
    });

    const outcome = await decideActions(
      input(aged),
      async () => [newProducts],
      loadCtx
    );

    expect(outcome.removed).toEqual(['cat-new']);
  });

  it('does nothing at all when no rule is enabled', async () => {
    const outcome = await decideActions(
      input(product()),
      async () => [{ ...newProducts, enabled: false }],
      loadCtx
    );

    expect(outcome).toEqual({
      actions: [],
      added: [],
      removed: [],
      rulesConsidered: 0,
    });
  });

  it('judges the staged projection', async () => {
    const midEdit = product({
      masterData: {
        published: true,
        hasStagedChanges: true,
        current: data(['cat-new']),
        staged: data([]),
      },
    });

    const outcome = await decideActions(
      input(midEdit),
      async () => [newProducts],
      loadCtx
    );

    // Staged has no categories yet and the product matches, so it is added —
    // and only to staged, because the merchandiser has an edit in flight.
    expect(outcome.actions).toEqual([
      {
        action: 'addToCategory',
        category: { typeId: 'category', id: 'cat-new' },
        staged: true,
      },
    ]);
  });

  it('never reads the catalog beyond the rules', async () => {
    const reads: string[] = [];
    await decideActions(
      input(product()),
      async () => {
        reads.push('rules');
        return [newProducts];
      },
      async () => {
        reads.push('context');
        return ctx;
      }
    );
    expect(reads).toEqual(['rules', 'context']);
  });
});

describe('createRuleLoader', () => {
  function loaderWith(ttlMs: number) {
    let calls = 0;
    let now = 0;
    const load = createRuleLoader(
      {} as ByProjectKeyRequestBuilder,
      async () => {
        calls++;
        return [newProducts];
      },
      ttlMs,
      () => now
    );
    return {
      load,
      calls: () => calls,
      advance: (ms: number) => {
        now += ms;
      },
    };
  }

  it('reads once inside the window and again after it', async () => {
    const loader = loaderWith(10_000);

    await loader.load();
    await loader.load();
    expect(loader.calls()).toBe(1);

    loader.advance(10_001);
    await loader.load();
    expect(loader.calls()).toBe(2);
  });

  it('reads every time when caching is switched off', async () => {
    const loader = loaderWith(0);
    await loader.load();
    await loader.load();
    expect(loader.calls()).toBe(2);
  });

  it('collapses concurrent reads into one', async () => {
    const loader = loaderWith(10_000);
    await Promise.all([loader.load(), loader.load(), loader.load()]);
    expect(loader.calls()).toBe(1);
  });
});

describe('request timestamps', () => {
  const recent: Rule = {
    ...newProducts,
    key: 'recent',
    conditions: [
      {
        field: { kind: 'createdAt', valueKind: 'date' },
        operator: 'withinLastDays',
        value: 7,
      },
    ],
  };

  /**
   * commercetools documents that a create's payload does not carry the
   * final `createdAt`. A rule reading it has to see the value the product
   * will actually have, or "everything added this week" never fires on
   * the write that adds the product.
   */
  it('treats a create as happening now, whatever the payload says', async () => {
    const withoutTimestamp = product({ createdAt: undefined });

    const outcome = await decideActions(
      input(withoutTimestamp, 'Create'),
      async () => [recent],
      loadCtx,
      NOW
    );

    expect(outcome.added).toEqual(['cat-new']);
  });

  it('is not fooled by a stale placeholder on a create', async () => {
    const stale = product({ createdAt: '2019-01-01T00:00:00.000Z' });

    const outcome = await decideActions(
      input(stale, 'Create'),
      async () => [recent],
      loadCtx,
      NOW
    );

    expect(outcome.added).toEqual(['cat-new']);
  });

  it('leaves createdAt alone on an update', async () => {
    const old = product({ createdAt: '2019-01-01T00:00:00.000Z' });

    const outcome = await decideActions(
      input(old, 'Update'),
      async () => [recent],
      loadCtx,
      NOW
    );

    expect(outcome.actions).toEqual([]);
  });

  it('treats lastModifiedAt as now on any write', async () => {
    const touched: Rule = {
      ...newProducts,
      key: 'touched',
      conditions: [
        {
          field: { kind: 'lastModifiedAt', valueKind: 'date' },
          operator: 'withinLastHours',
          value: 1,
        },
      ],
    };
    const old = product({ lastModifiedAt: '2019-01-01T00:00:00.000Z' });

    const outcome = await decideActions(
      input(old, 'Update'),
      async () => [touched],
      loadCtx,
      NOW
    );

    expect(outcome.added).toEqual(['cat-new']);
  });
});
