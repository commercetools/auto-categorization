/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import request from 'supertest';

const SECRET = 'dummy-secret-that-is-long-enough';

process.env.CTP_CLIENT_ID = 'a'.repeat(24);
process.env.CTP_CLIENT_SECRET = 'b'.repeat(32);
process.env.CTP_PROJECT_KEY = 'test-project';
process.env.CTP_SCOPE = 'manage_products:test-project';
process.env.CTP_REGION = 'us-central1.gcp';
process.env.EXTENSION_AUTH_SECRET = SECRET;
process.env.RULE_CACHE_SECONDS = '0';

const listRules = jest.fn();

jest.mock('../src/shared', () => {
  const actual = jest.requireActual('../src/shared');
  return { ...actual, listRules: (...args: unknown[]) => listRules(...args) };
});

jest.mock('../src/client/create.client', () => ({
  createApiRoot: () => ({}),
}));

jest.mock('../src/utils/context.cache', () => ({
  getEvaluationContext: async () => ({
    now: new Date('2026-09-28T12:00:00.000Z'),
    productTypeKeyById: {},
    defaultCurrency: 'USD',
    fractionDigitsByCurrency: { USD: 2 },
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../src/app').default;

const NEW_PRODUCTS = {
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
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function data(categories: string[] = []) {
  return {
    name: { 'en-US': 'Ramps' },
    slug: { 'en-US': 'ramps' },
    categories: categories.map((id) => ({ typeId: 'category', id })),
    masterVariant: { id: 1, sku: 'ABC-1' },
    variants: [],
    searchKeywords: {},
  };
}

const payload = {
  action: 'Update',
  resource: {
    typeId: 'product',
    id: 'p-1',
    obj: {
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
    },
  },
};

beforeEach(() => {
  listRules.mockReset();
  listRules.mockResolvedValue([NEW_PRODUCTS]);
});

describe('authorization', () => {
  it.each([
    ['no header', undefined],
    ['empty bearer', 'Bearer '],
    ['wrong secret', 'Bearer not-the-secret-but-long-enough'],
    ['right secret, wrong scheme', `Basic ${SECRET}`],
    ['secret without the scheme', SECRET],
    ['secret with trailing content', `Bearer ${SECRET}x`],
  ])('rejects %s with 401', async (_label, header) => {
    const call = request(app).post('/product-extension').send(payload);
    if (header) call.set('authorization', header);

    const response = await call;

    expect(response.status).toBe(401);
    expect(listRules).not.toHaveBeenCalled();
  });

  it('accepts the registered secret', async () => {
    const response = await request(app)
      .post('/product-extension')
      .set('authorization', `Bearer ${SECRET}`)
      .send(payload);

    expect(response.status).toBe(200);
  });

  it('leaves the liveness route open', async () => {
    const response = await request(app).get('/product-extension/status');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('extension response', () => {
  const authed = () =>
    request(app)
      .post('/product-extension')
      .set('authorization', `Bearer ${SECRET}`);

  it('returns the update actions commercetools should apply', async () => {
    const response = await authed().send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      actions: [
        {
          action: 'addToCategory',
          category: { typeId: 'category', id: 'cat-new' },
          staged: false,
        },
      ],
    });
  });

  it('returns no actions for a product already in place', async () => {
    const settled = JSON.parse(JSON.stringify(payload));
    settled.resource.obj.masterData.current = data(['cat-new']);
    settled.resource.obj.masterData.staged = data(['cat-new']);

    const response = await authed().send(settled);

    expect(response.body).toEqual({ actions: [] });
  });

  it('returns no actions rather than an error for a malformed payload', async () => {
    const response = await authed().send({ action: 'Update' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ actions: [] });
  });

  it('fails open when reading the rules fails', async () => {
    listRules.mockRejectedValue(new Error('commercetools is unreachable'));

    const response = await authed().send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ actions: [] });
  });

  it('is idempotent: applying its own output leaves nothing to do', async () => {
    const first = await authed().send(payload);
    expect(first.body.actions).toHaveLength(1);

    const applied = JSON.parse(JSON.stringify(payload));
    applied.resource.obj.masterData.current = data(['cat-new']);
    applied.resource.obj.masterData.staged = data(['cat-new']);

    const second = await authed().send(applied);
    expect(second.body.actions).toEqual([]);
  });
});
