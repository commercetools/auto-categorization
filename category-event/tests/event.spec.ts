/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import request from 'supertest';

process.env.CTP_CLIENT_ID = 'a'.repeat(24);
process.env.CTP_CLIENT_SECRET = 'b'.repeat(32);
process.env.CTP_PROJECT_KEY = 'test-project';
process.env.CTP_SCOPE = 'manage_products:test-project';
process.env.CTP_REGION = 'us-central1.gcp';
process.env.PORT = '8080';

const listRules = jest.fn();
const enqueueSweep = jest.fn();

jest.mock('../src/shared', () => {
  const actual = jest.requireActual('../src/shared');
  return {
    ...actual,
    listRules: (...args: unknown[]) => listRules(...args),
    enqueueSweep: (...args: unknown[]) => enqueueSweep(...args),
  };
});

jest.mock('../src/client/create.client', () => ({ createApiRoot: () => ({}) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../src/app').default;

const RULE = {
  key: 'new-products',
  categoryId: 'cat-new',
  enabled: true,
  match: 'all',
  conditions: [],
  name: 'New products',
  removeWhenNoLongerMatching: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function envelope(notification: unknown) {
  return {
    message: {
      data: Buffer.from(JSON.stringify(notification)).toString('base64'),
    },
  };
}

function categoryChange(id = 'cat-new', notificationType = 'ResourceUpdated') {
  return {
    notificationType,
    resource: { typeId: 'category', id },
    version: 4,
  };
}

beforeEach(() => {
  listRules.mockReset().mockResolvedValue([RULE]);
  enqueueSweep.mockReset().mockResolvedValue(undefined);
});

describe('envelope handling', () => {
  it.each([
    ['an empty body', {}],
    ['a message with no data', { message: {} }],
    ['data that is not base64 JSON', { message: { data: 'bm90LWpzb24=' } }],
    [
      'a notification with no resource',
      { message: { data: Buffer.from('{"notificationType":"ResourceUpdated"}').toString('base64') } },
    ],
  ])('acknowledges %s without retrying', async (_label, body) => {
    const response = await request(app).post('/category-event').send(body);

    expect(response.status).toBe(200);
    expect(enqueueSweep).not.toHaveBeenCalled();
  });
});

describe('acknowledgement contract', () => {
  it('queues a sweep for a category that has rules', async () => {
    const response = await request(app)
      .post('/category-event')
      .send(envelope(categoryChange()));

    expect(response.status).toBe(204);
    expect(enqueueSweep).toHaveBeenCalledWith({}, 'cat-new');
  });

  it('acknowledges a category no rule targets', async () => {
    const response = await request(app)
      .post('/category-event')
      .send(envelope(categoryChange('cat-other')));

    expect(response.status).toBe(204);
    expect(enqueueSweep).not.toHaveBeenCalled();
  });

  it('acknowledges a category whose only rule is disabled', async () => {
    listRules.mockResolvedValue([{ ...RULE, enabled: false }]);

    const response = await request(app)
      .post('/category-event')
      .send(envelope(categoryChange()));

    expect(response.status).toBe(204);
    expect(enqueueSweep).not.toHaveBeenCalled();
  });

  it('acknowledges the deletion of a category', async () => {
    const response = await request(app)
      .post('/category-event')
      .send(envelope(categoryChange('cat-new', 'ResourceDeleted')));

    expect(response.status).toBe(204);
    expect(enqueueSweep).not.toHaveBeenCalled();
  });

  it("acknowledges the Subscription's own test notification", async () => {
    const response = await request(app)
      .post('/category-event')
      .send(
        envelope({
          notificationType: 'ResourceCreated',
          resource: { typeId: 'subscription', id: 's-1' },
        })
      );

    expect(response.status).toBe(204);
    expect(enqueueSweep).not.toHaveBeenCalled();
  });

  it('acknowledges a product change, which the extension already handled', async () => {
    const response = await request(app)
      .post('/category-event')
      .send(
        envelope({
          notificationType: 'ResourceUpdated',
          resource: { typeId: 'product', id: 'p-1' },
        })
      );

    expect(response.status).toBe(204);
    expect(listRules).not.toHaveBeenCalled();
  });

  it('asks for redelivery on a transient failure', async () => {
    enqueueSweep.mockRejectedValue(
      Object.assign(new Error('service unavailable'), { statusCode: 503 })
    );

    const response = await request(app)
      .post('/category-event')
      .send(envelope(categoryChange()));

    expect(response.status).toBe(503);
  });

  it('asks for redelivery when a concurrent write wins', async () => {
    enqueueSweep.mockRejectedValue(
      Object.assign(new Error('conflict'), { statusCode: 409 })
    );

    const response = await request(app)
      .post('/category-event')
      .send(envelope(categoryChange()));

    expect(response.status).toBe(503);
  });

  it('acknowledges a permanent failure rather than looping on it', async () => {
    enqueueSweep.mockRejectedValue(
      Object.assign(new Error('bad request'), { statusCode: 400 })
    );

    const response = await request(app)
      .post('/category-event')
      .send(envelope(categoryChange()));

    expect(response.status).toBe(200);
  });

  it('is a no-op when the same notification arrives twice', async () => {
    await request(app).post('/category-event').send(envelope(categoryChange()));
    await request(app).post('/category-event').send(envelope(categoryChange()));

    // enqueueSweep itself de-duplicates against the stored queue; the handler
    // simply asks twice, which is the contract at-least-once delivery needs.
    expect(enqueueSweep).toHaveBeenCalledTimes(2);
    expect(enqueueSweep).toHaveBeenNthCalledWith(2, {}, 'cat-new');
  });
});

describe('liveness', () => {
  it('answers on the status route', async () => {
    const response = await request(app).get('/category-event/status');
    expect(response.status).toBe(200);
  });
});
