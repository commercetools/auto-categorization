/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ProductProjection } from '@commercetools/platform-sdk';
import type { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import { sweepAll, sweepChunk } from '../src/sweep';
import { EvaluationContext, Rule } from '../src/types';

const NOW = new Date('2026-09-28T12:00:00.000Z');

const ctx: EvaluationContext = {
  now: NOW,
  productTypeKeyById: {},
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

function product(id: string, createdAt: string, categories: string[] = []) {
  return {
    id,
    version: 1,
    createdAt,
    lastModifiedAt: createdAt,
    published: true,
    hasStagedChanges: false,
    productType: { typeId: 'product-type', id: 'pt-1' },
    name: { 'en-US': id },
    slug: { 'en-US': id },
    categories: categories.map((cid) => ({ typeId: 'category', id: cid })),
    masterVariant: { id: 1 },
    variants: [],
  } as unknown as ProductProjection;
}

/**
 * A stand-in for the SDK's request builder that serves a fixed catalog with
 * the same keyset-pagination contract the real endpoint has, and records
 * every product update it is asked to make.
 */
function fakeApiRoot(catalog: ProductProjection[]) {
  const updates: Array<{ id: string; body: unknown }> = [];
  const queries: Array<Record<string, unknown>> = [];

  const apiRoot = {
    productProjections: () => ({
      get: ({ queryArgs }: { queryArgs: Record<string, unknown> }) => ({
        execute: async () => {
          queries.push(queryArgs);
          const after = typeof queryArgs.where === 'string'
            ? String(queryArgs.where).replace(/^id > "|"$/g, '')
            : undefined;
          const sorted = [...catalog].sort((a, b) => a.id.localeCompare(b.id));
          const start = after
            ? sorted.findIndex((p) => p.id === after) + 1
            : 0;
          return {
            body: {
              results: sorted.slice(start, start + Number(queryArgs.limit)),
            },
          };
        },
      }),
    }),
    products: () => ({
      withId: ({ ID }: { ID: string }) => ({
        post: ({ body }: { body: unknown }) => ({
          execute: async () => {
            updates.push({ id: ID, body });
            return { body: {} };
          },
        }),
      }),
    }),
  } as unknown as ByProjectKeyRequestBuilder;

  return { apiRoot, updates, queries };
}

describe('sweepChunk', () => {
  it('assigns the matching products and leaves the rest alone', async () => {
    const { apiRoot, updates } = fakeApiRoot([
      product('p1', '2026-09-27T00:00:00.000Z'),
      product('p2', '2026-01-01T00:00:00.000Z'),
      product('p3', '2026-09-25T00:00:00.000Z'),
    ]);

    const result = await sweepChunk(apiRoot, { rules: [newProducts], ctx });

    expect(result.done).toBe(true);
    expect(result.totals).toEqual({
      scanned: 3,
      productsChanged: 2,
      added: 2,
      removed: 0,
    });
    expect(updates.map((u) => u.id).sort()).toEqual(['p1', 'p3']);
  });

  it('writes nothing on a dry run but still counts what it would do', async () => {
    const { apiRoot, updates } = fakeApiRoot([
      product('p1', '2026-09-27T00:00:00.000Z'),
    ]);

    const result = await sweepChunk(apiRoot, {
      rules: [newProducts],
      ctx,
      dryRun: true,
    });

    expect(result.totals.productsChanged).toBe(1);
    expect(updates).toEqual([]);
  });

  it('is a no-op the second time it runs over the same catalog', async () => {
    const catalog = [product('p1', '2026-09-27T00:00:00.000Z')];
    const first = fakeApiRoot(catalog);
    await sweepChunk(first.apiRoot, { rules: [newProducts], ctx });
    expect(first.updates).toHaveLength(1);

    const settled = [
      product('p1', '2026-09-27T00:00:00.000Z', ['cat-new']),
    ];
    const second = fakeApiRoot(settled);
    const result = await sweepChunk(second.apiRoot, {
      rules: [newProducts],
      ctx,
    });

    expect(second.updates).toEqual([]);
    expect(result.totals.productsChanged).toBe(0);
  });

  it('takes the category back from a product that aged out', async () => {
    const { apiRoot, updates } = fakeApiRoot([
      product('p1', '2026-01-01T00:00:00.000Z', ['cat-new']),
    ]);

    const result = await sweepChunk(apiRoot, { rules: [newProducts], ctx });

    expect(result.totals.removed).toBe(1);
    expect(updates[0].body).toMatchObject({
      actions: [
        {
          action: 'removeFromCategory',
          category: { typeId: 'category', id: 'cat-new' },
          staged: false,
        },
      ],
    });
  });

  it('pages with a keyset cursor and stops at the page budget', async () => {
    const catalog = Array.from({ length: 25 }, (_, i) =>
      product(`p${String(i).padStart(2, '0')}`, '2026-09-27T00:00:00.000Z')
    );
    const { apiRoot, queries } = fakeApiRoot(catalog);

    const result = await sweepChunk(apiRoot, {
      rules: [newProducts],
      ctx,
      pageSize: 10,
      maxPages: 2,
    });

    expect(result.done).toBe(false);
    expect(result.cursor).toBe('p19');
    expect(result.totals.scanned).toBe(20);
    expect(queries[0].where).toBeUndefined();
    expect(queries[1].where).toBe('id > "p09"');
    expect(queries.every((q) => q.sort)).toBe(true);
    expect(queries.every((q) => q.staged === true)).toBe(true);
  });

  it('resumes from the cursor it handed back', async () => {
    const catalog = Array.from({ length: 25 }, (_, i) =>
      product(`p${String(i).padStart(2, '0')}`, '2026-09-27T00:00:00.000Z')
    );
    const { apiRoot } = fakeApiRoot(catalog);

    const result = await sweepChunk(apiRoot, {
      rules: [newProducts],
      ctx,
      pageSize: 10,
      maxPages: 2,
      cursor: 'p19',
    });

    expect(result.done).toBe(true);
    expect(result.totals.scanned).toBe(5);
  });
});

describe('sweepAll', () => {
  it('walks the whole catalog across as many chunks as it takes', async () => {
    const catalog = Array.from({ length: 25 }, (_, i) =>
      product(`p${String(i).padStart(2, '0')}`, '2026-09-27T00:00:00.000Z')
    );
    const { apiRoot, updates } = fakeApiRoot(catalog);

    const result = await sweepAll(apiRoot, {
      rules: [newProducts],
      ctx,
      pageSize: 10,
      maxPages: 1,
    });

    expect(result.done).toBe(true);
    expect(result.totals.scanned).toBe(25);
    expect(updates).toHaveLength(25);
  });
});
