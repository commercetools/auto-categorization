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

const runSweepJob = jest.fn();

jest.mock('../src/handlers/sweep.job', () => ({
  ALL_TARGET: 'all',
  runSweepJob: (...args: unknown[]) => runSweepJob(...args),
}));

jest.mock('../src/client/create.client', () => ({ createApiRoot: () => ({}) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../src/app').default;

beforeEach(() => {
  runSweepJob.mockReset();
  runSweepJob.mockResolvedValue({ ranAs: 'run-1', targets: [] });
});

describe('the scheduled endpoint', () => {
  it('answers on the liveness route', async () => {
    const response = await request(app).get('/sweep-job/status');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('runs the sweep and reports what it did', async () => {
    runSweepJob.mockResolvedValue({
      ranAs: 'run-1',
      targets: [
        {
          scope: 'category',
          target: 'cat-new',
          done: true,
          totals: { scanned: 10, productsChanged: 2, added: 2, removed: 0 },
        },
      ],
    });

    const response = await request(app).post('/sweep-job').send({});

    expect(response.status).toBe(200);
    expect(response.body.targets).toHaveLength(1);
  });

  it('reports a failed run as a failed run', async () => {
    runSweepJob.mockRejectedValue(new Error('commercetools is unreachable'));

    const response = await request(app).post('/sweep-job').send({});

    // Progress is checkpointed, so the next tick resumes rather than
    // starting the catalog over — but the run itself did fail, and the
    // schedule should say so.
    expect(response.status).toBe(500);
  });

  it('is a 404 anywhere else', async () => {
    const response = await request(app).get('/nope');
    expect(response.status).toBe(404);
  });
});
