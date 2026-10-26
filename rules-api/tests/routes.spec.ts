/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import request from 'supertest';
import type { Rule } from '../src/shared';

process.env.CTP_CLIENT_ID = 'a'.repeat(24);
process.env.CTP_CLIENT_SECRET = 'b'.repeat(32);
process.env.CTP_PROJECT_KEY = 'test-project';
process.env.CTP_SCOPE = 'manage_products:test-project';
process.env.CTP_REGION = 'us-central1.gcp';
process.env.PUBLIC_API_URL = 'https://rules-api.example.commercetools.app';
process.env.CLOUD_IDENTIFIER = 'gcp-us';

/**
 * The session middleware verifies a JWT the Merchant Center API Gateway
 * mints. Its own rejection matrix is the package's to test; what this suite
 * owns is everything downstream — that a verified session still has to
 * carry the right permission, and that the routes behave.
 */
let session: Record<string, unknown> | undefined = {
  userId: 'user-1',
  projectKey: 'test-project',
  userPermissions: ['canManageAutoCategorization'],
};

jest.mock('@commercetools-backend/express', () => ({
  CLOUD_IDENTIFIERS: { GCP_US: 'gcp-us' },
  createSessionMiddleware:
    () =>
    (
      req: { session?: unknown },
      res: { status: (n: number) => { send: (b: unknown) => void } },
      next: () => void
    ) => {
      if (!session) {
        res.status(401).send({ message: 'Unauthorized' });
        return;
      }
      req.session = session;
      next();
    },
}));

const store = {
  listRules: jest.fn(),
  getRule: jest.fn(),
  saveRule: jest.fn(),
  deleteRule: jest.fn(),
  enqueueSweep: jest.fn(),
  getRunSummary: jest.fn(),
  saveRunSummary: jest.fn(),
  sweepChunk: jest.fn(),
  loadEvaluationContext: jest.fn(),
  buildFieldCatalog: jest.fn(),
};

jest.mock('../src/shared', () => {
  const actual = jest.requireActual('../src/shared');
  return {
    ...actual,
    listRules: (...a: unknown[]) => store.listRules(...a),
    getRule: (...a: unknown[]) => store.getRule(...a),
    saveRule: (...a: unknown[]) => store.saveRule(...a),
    deleteRule: (...a: unknown[]) => store.deleteRule(...a),
    enqueueSweep: (...a: unknown[]) => store.enqueueSweep(...a),
    getRunSummary: (...a: unknown[]) => store.getRunSummary(...a),
    saveRunSummary: (...a: unknown[]) => store.saveRunSummary(...a),
    sweepChunk: (...a: unknown[]) => store.sweepChunk(...a),
    loadEvaluationContext: (...a: unknown[]) => store.loadEvaluationContext(...a),
    buildFieldCatalog: (...a: unknown[]) => store.buildFieldCatalog(...a),
  };
});

jest.mock('../src/client/create.client', () => ({
  createApiRoot: () => ({
    get: () => ({
      execute: async () => ({
        body: { languages: ['en-US'], currencies: ['USD'] },
      }),
    }),
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../src/app').default;

const RULE: Rule = {
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

const DRAFT = {
  name: 'New products',
  categoryId: 'cat-new',
  enabled: true,
  match: 'all',
  conditions: RULE.conditions,
  removeWhenNoLongerMatching: true,
};

beforeEach(() => {
  Object.values(store).forEach((fn) => fn.mockReset());
  session = {
    userId: 'user-1',
    projectKey: 'test-project',
    userPermissions: ['canManageAutoCategorization'],
  };

  store.listRules.mockResolvedValue([RULE]);
  store.getRule.mockResolvedValue(undefined);
  store.saveRule.mockImplementation(async (_root: unknown, rule: Rule) => rule);
  store.deleteRule.mockResolvedValue(true);
  store.enqueueSweep.mockResolvedValue(undefined);
  store.getRunSummary.mockResolvedValue(undefined);
  store.saveRunSummary.mockResolvedValue(undefined);
  store.buildFieldCatalog.mockReturnValue([{ id: 'name' }]);
  store.loadEvaluationContext.mockResolvedValue({
    productTypes: [],
    ctx: {
      now: new Date('2026-09-28T12:00:00.000Z'),
      productTypeKeyById: {},
      defaultCurrency: 'USD',
      fractionDigitsByCurrency: { USD: 2 },
    },
  });
  store.sweepChunk.mockResolvedValue({
    cursor: undefined,
    done: true,
    totals: { scanned: 3, productsChanged: 2, added: 2, removed: 0 },
    changes: [{ productId: 'p1', added: ['cat-new'], removed: [] }],
  });
});

describe('liveness', () => {
  it('answers without a session', async () => {
    session = undefined;
    const response = await request(app).get('/rules-api/status');
    expect(response.status).toBe(200);
  });
});

describe('session', () => {
  it('refuses every working route without one', async () => {
    session = undefined;

    for (const call of [
      request(app).get('/rules-api/rules'),
      request(app).get('/rules-api/meta'),
      request(app).put('/rules-api/rules/x').send(DRAFT),
      request(app).post('/rules-api/rules/x/run').send({}),
    ]) {
      expect((await call).status).toBe(401);
    }
  });
});

describe('permissions', () => {
  it('refuses a session carrying no permissions claim', async () => {
    session = { userId: 'user-1', projectKey: 'test-project' };
    const response = await request(app).get('/rules-api/rules');
    expect(response.status).toBe(403);
  });

  it('refuses a write from a view-only user', async () => {
    session = {
      userId: 'user-1',
      projectKey: 'test-project',
      userPermissions: ['canViewAutoCategorization'],
    };

    expect((await request(app).put('/rules-api/rules/x').send(DRAFT)).status).toBe(403);
    expect((await request(app).delete('/rules-api/rules/x')).status).toBe(403);
    expect((await request(app).post('/rules-api/rules/x/run').send({})).status).toBe(403);
  });

  it('lets a view-only user read', async () => {
    session = {
      userId: 'user-1',
      projectKey: 'test-project',
      userPermissions: ['canViewAutoCategorization'],
    };
    expect((await request(app).get('/rules-api/rules')).status).toBe(200);
  });

  it('lets a manage user read as well as write', async () => {
    expect((await request(app).get('/rules-api/rules')).status).toBe(200);
    expect((await request(app).put('/rules-api/rules/new-products').send(DRAFT)).status).toBe(201);
  });
});

describe('rule CRUD', () => {
  it('lists every rule', async () => {
    const response = await request(app).get('/rules-api/rules');
    expect(response.body.rules).toHaveLength(1);
  });

  it('filters by category', async () => {
    store.listRules.mockResolvedValue([
      RULE,
      { ...RULE, key: 'other', categoryId: 'cat-other' },
    ]);

    const response = await request(app)
      .get('/rules-api/rules')
      .query({ categoryId: 'cat-other' });

    expect(response.body.rules.map((r: Rule) => r.key)).toEqual(['other']);
  });

  it('creates a rule and queues its category', async () => {
    const response = await request(app)
      .put('/rules-api/rules/new-products')
      .send(DRAFT);

    expect(response.status).toBe(201);
    expect(response.body.rule.key).toBe('new-products');
    expect(store.enqueueSweep).toHaveBeenCalledWith(expect.anything(), 'cat-new');
  });

  it('rejects a rule the engine could not run', async () => {
    const response = await request(app)
      .put('/rules-api/rules/broken')
      .send({ ...DRAFT, conditions: [] });

    expect(response.status).toBe(400);
    expect(response.body.issues.join(' ')).toContain('at least one condition');
    expect(store.saveRule).not.toHaveBeenCalled();
  });

  it('rejects an operator the field does not support', async () => {
    const response = await request(app)
      .put('/rules-api/rules/broken')
      .send({
        ...DRAFT,
        conditions: [
          {
            field: { kind: 'price', valueKind: 'number' },
            operator: 'startsWith',
            value: '5',
          },
        ],
      });

    expect(response.status).toBe(400);
  });

  it('keeps createdAt and queues both categories when the target moves', async () => {
    store.getRule.mockResolvedValue(RULE);

    const response = await request(app)
      .put('/rules-api/rules/new-products')
      .send({ ...DRAFT, categoryId: 'cat-moved' });

    expect(response.status).toBe(200);
    expect(response.body.rule.createdAt).toBe(RULE.createdAt);
    expect(store.enqueueSweep).toHaveBeenCalledWith(expect.anything(), 'cat-moved');
    expect(store.enqueueSweep).toHaveBeenCalledWith(expect.anything(), 'cat-new');
  });

  it('deletes a rule and releases the products it held', async () => {
    store.getRule.mockResolvedValue(RULE);

    const response = await request(app).delete('/rules-api/rules/new-products');

    expect(response.status).toBe(204);
    expect(store.enqueueSweep).toHaveBeenCalledWith(expect.anything(), 'cat-new');
  });

  it('is a 404 for a rule that does not exist', async () => {
    expect((await request(app).get('/rules-api/rules/nope')).status).toBe(404);
    expect((await request(app).delete('/rules-api/rules/nope')).status).toBe(404);
    expect((await request(app).post('/rules-api/rules/nope/run').send({})).status).toBe(404);
  });
});

describe('running a rule', () => {
  it('reports what it changed and that it finished', async () => {
    store.getRule.mockResolvedValue(RULE);

    const response = await request(app)
      .post('/rules-api/rules/new-products/run')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.done).toBe(true);
    expect(response.body.totals).toEqual({
      scanned: 3,
      productsChanged: 2,
      added: 2,
      removed: 0,
    });
    expect(store.saveRunSummary).toHaveBeenCalled();
  });

  it('hands back a cursor when there is more catalog to walk', async () => {
    store.getRule.mockResolvedValue(RULE);
    store.sweepChunk.mockResolvedValue({
      cursor: 'p100',
      done: false,
      totals: { scanned: 100, productsChanged: 4, added: 4, removed: 0 },
      changes: [],
    });

    const response = await request(app)
      .post('/rules-api/rules/new-products/run')
      .send({});

    expect(response.body).toMatchObject({ cursor: 'p100', done: false });
  });

  it('carries totals forward when resumed from a cursor', async () => {
    store.getRule.mockResolvedValue(RULE);
    store.getRunSummary.mockResolvedValue({
      target: 'new-products',
      scope: 'rule',
      startedAt: '2026-09-28T11:00:00.000Z',
      finishedAt: '2026-09-28T11:00:10.000Z',
      dryRun: false,
      totals: { scanned: 100, productsChanged: 4, added: 4, removed: 0 },
      sample: [],
    });

    const response = await request(app)
      .post('/rules-api/rules/new-products/run')
      .send({ cursor: 'p100' });

    expect(response.body.totals).toEqual({
      scanned: 103,
      productsChanged: 6,
      added: 6,
      removed: 0,
    });
    expect(response.body.startedAt).toBe('2026-09-28T11:00:00.000Z');
  });

  it('passes the dry-run flag through to the sweep', async () => {
    store.getRule.mockResolvedValue(RULE);

    await request(app)
      .post('/rules-api/rules/new-products/run')
      .send({ dryRun: true });

    expect(store.sweepChunk).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dryRun: true })
    );
  });

  it('runs every rule on a category together', async () => {
    store.listRules.mockResolvedValue([
      RULE,
      { ...RULE, key: 'second' },
      { ...RULE, key: 'elsewhere', categoryId: 'cat-other' },
    ]);

    const response = await request(app)
      .post('/rules-api/categories/cat-new/run')
      .send({});

    expect(response.status).toBe(200);
    expect(store.sweepChunk).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        rules: expect.arrayContaining([
          expect.objectContaining({ key: 'new-products' }),
          expect.objectContaining({ key: 'second' }),
        ]),
      })
    );
    expect(store.sweepChunk.mock.calls[0][1].rules).toHaveLength(2);
  });

  it('is a 404 for a category with no rules', async () => {
    store.listRules.mockResolvedValue([]);
    const response = await request(app)
      .post('/rules-api/categories/cat-empty/run')
      .send({});
    expect(response.status).toBe(404);
  });
});

describe('metadata', () => {
  it('serves the field catalog and the Project locales', async () => {
    const response = await request(app).get('/rules-api/meta');

    expect(response.status).toBe(200);
    expect(response.body.fields).toEqual([{ id: 'name' }]);
    expect(response.body.languages).toEqual(['en-US']);
    expect(response.body.operatorsByValueKind.text).toContain('startsWith');
  });
});

describe('last run', () => {
  it('is null before anything has run', async () => {
    const response = await request(app).get('/rules-api/runs/rule/new-products');
    expect(response.body.run).toBeNull();
  });

  it('rejects a scope it does not know', async () => {
    const response = await request(app).get('/rules-api/runs/nonsense/x');
    expect(response.status).toBe(400);
  });
});
