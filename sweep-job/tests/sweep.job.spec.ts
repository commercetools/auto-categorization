/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import type { Rule } from '../src/shared';

const lib = {
  acquireJobLock: jest.fn(),
  releaseJobLock: jest.fn(),
  drainSweepQueue: jest.fn(),
  enqueueSweep: jest.fn(),
  listRules: jest.fn(),
  loadEvaluationContext: jest.fn(),
  sweepChunk: jest.fn(),
  getRunSummary: jest.fn(),
  saveRunSummary: jest.fn(),
  readSystemValue: jest.fn(),
  writeSystemValue: jest.fn(),
};

jest.mock('../src/shared', () => {
  const actual = jest.requireActual('../src/shared');
  return {
    ...actual,
    acquireJobLock: (...a: unknown[]) => lib.acquireJobLock(...a),
    releaseJobLock: (...a: unknown[]) => lib.releaseJobLock(...a),
    drainSweepQueue: (...a: unknown[]) => lib.drainSweepQueue(...a),
    enqueueSweep: (...a: unknown[]) => lib.enqueueSweep(...a),
    listRules: (...a: unknown[]) => lib.listRules(...a),
    loadEvaluationContext: (...a: unknown[]) => lib.loadEvaluationContext(...a),
    sweepChunk: (...a: unknown[]) => lib.sweepChunk(...a),
    getRunSummary: (...a: unknown[]) => lib.getRunSummary(...a),
    saveRunSummary: (...a: unknown[]) => lib.saveRunSummary(...a),
    readSystemValue: (...a: unknown[]) => lib.readSystemValue(...a),
    writeSystemValue: (...a: unknown[]) => lib.writeSystemValue(...a),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runSweepJob, ALL_TARGET } = require('../src/handlers/sweep.job');

const NOW = new Date('2026-09-28T12:00:00.000Z');
const apiRoot = {} as ByProjectKeyRequestBuilder;

const config = {
  clientId: 'a'.repeat(24),
  clientSecret: 'b'.repeat(32),
  projectKey: 'test-project',
  region: 'us-central1.gcp',
  pageSize: 100,
  budgetMinutes: 25,
  fullReconcileMinutes: 60,
  lockTtlMinutes: 35,
};

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
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
};

const DONE_CHUNK = {
  cursor: undefined,
  done: true,
  totals: { scanned: 10, productsChanged: 2, added: 2, removed: 0 },
  changes: [],
};

beforeEach(() => {
  Object.values(lib).forEach((fn) => fn.mockReset());
  lib.acquireJobLock.mockResolvedValue(true);
  lib.releaseJobLock.mockResolvedValue(undefined);
  lib.drainSweepQueue.mockResolvedValue([]);
  lib.enqueueSweep.mockResolvedValue(undefined);
  lib.listRules.mockResolvedValue([RULE]);
  lib.loadEvaluationContext.mockResolvedValue({ productTypes: [], ctx: { now: NOW } });
  lib.sweepChunk.mockResolvedValue(DONE_CHUNK);
  lib.getRunSummary.mockResolvedValue(undefined);
  lib.saveRunSummary.mockResolvedValue(undefined);
  lib.readSystemValue.mockResolvedValue({ at: NOW.toISOString() });
  lib.writeSystemValue.mockResolvedValue(undefined);
});

describe('the run lease', () => {
  it('does nothing while a previous run holds it', async () => {
    lib.acquireJobLock.mockResolvedValue(false);

    const result = await runSweepJob(apiRoot, config, 'run-1', NOW);

    expect(result.skipped).toBe('locked');
    expect(lib.drainSweepQueue).not.toHaveBeenCalled();
    expect(lib.releaseJobLock).not.toHaveBeenCalled();
  });

  it('releases it even when the run throws', async () => {
    lib.drainSweepQueue.mockRejectedValue(new Error('boom'));

    await expect(runSweepJob(apiRoot, config, 'run-1', NOW)).rejects.toThrow(
      'boom'
    );
    expect(lib.releaseJobLock).toHaveBeenCalledWith(apiRoot, 'run-1');
  });

  it('takes it for longer than the application can run', async () => {
    await runSweepJob(apiRoot, config, 'run-1', NOW);
    expect(lib.acquireJobLock).toHaveBeenCalledWith(apiRoot, 'run-1', NOW, 35);
    expect(config.lockTtlMinutes).toBeGreaterThan(30);
  });
});

describe('draining the queue', () => {
  it('sweeps each queued category with only that category rules', async () => {
    lib.drainSweepQueue.mockResolvedValue(['cat-new']);
    lib.listRules.mockResolvedValue([
      RULE,
      { ...RULE, key: 'elsewhere', categoryId: 'cat-other' },
    ]);

    const result = await runSweepJob(apiRoot, config, 'run-1', NOW);

    expect(result.targets).toEqual([
      { scope: 'category', target: 'cat-new', done: true, totals: DONE_CHUNK.totals },
    ]);
    expect(lib.sweepChunk.mock.calls[0][1].rules).toEqual([RULE]);
  });

  it('skips a queued category whose rules are all disabled', async () => {
    lib.drainSweepQueue.mockResolvedValue(['cat-new']);
    lib.listRules.mockResolvedValue([{ ...RULE, enabled: false }]);

    const result = await runSweepJob(apiRoot, config, 'run-1', NOW);

    expect(result.targets).toEqual([]);
    expect(lib.sweepChunk).not.toHaveBeenCalled();
  });

  it('puts an unfinished category back on the queue', async () => {
    lib.drainSweepQueue.mockResolvedValue(['cat-new']);
    lib.sweepChunk.mockResolvedValue({
      cursor: 'p500',
      done: false,
      totals: { scanned: 500, productsChanged: 1, added: 1, removed: 0 },
      changes: [],
    });

    // A budget already spent, so the loop checkpoints after one chunk.
    await runSweepJob(apiRoot, { ...config, budgetMinutes: 0 }, 'run-1', NOW);

    expect(lib.enqueueSweep).toHaveBeenCalledWith(apiRoot, 'cat-new');
  });

  it('checkpoints the cursor when the budget runs out mid-catalog', async () => {
    lib.drainSweepQueue.mockResolvedValue(['cat-new']);
    lib.sweepChunk.mockResolvedValue({
      cursor: 'p500',
      done: false,
      totals: { scanned: 500, productsChanged: 1, added: 1, removed: 0 },
      changes: [],
    });

    // One chunk fits inside the budget; the clock then jumps past it, which
    // is what a long chunk looks like from the loop's point of view.
    const real = Date.now();
    const clock = jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(real) // deadline is set from here
      .mockReturnValueOnce(real) // the for-loop pre-check
      .mockReturnValueOnce(real) // first pass of the while loop
      .mockReturnValue(real + 60 * 60_000);

    try {
      await runSweepJob(apiRoot, config, 'run-1', NOW);
    } finally {
      clock.mockRestore();
    }

    expect(lib.sweepChunk).toHaveBeenCalledTimes(1);
    expect(lib.saveRunSummary).toHaveBeenCalledWith(
      apiRoot,
      expect.objectContaining({ cursor: 'p500', complete: false })
    );
    expect(lib.enqueueSweep).toHaveBeenCalledWith(apiRoot, 'cat-new');
  });

  it('resumes from a checkpoint instead of starting over', async () => {
    lib.drainSweepQueue.mockResolvedValue(['cat-new']);
    lib.getRunSummary.mockResolvedValue({
      target: 'cat-new',
      scope: 'category',
      startedAt: '2026-09-28T11:00:00.000Z',
      finishedAt: '2026-09-28T11:20:00.000Z',
      dryRun: false,
      totals: { scanned: 500, productsChanged: 1, added: 1, removed: 0 },
      sample: [],
      cursor: 'p500',
      complete: false,
    });

    const result = await runSweepJob(apiRoot, config, 'run-1', NOW);

    expect(lib.sweepChunk.mock.calls[0][1].cursor).toBe('p500');
    expect(result.targets[0].totals.scanned).toBe(510);
  });

  it('ignores a completed summary and starts a fresh pass', async () => {
    lib.drainSweepQueue.mockResolvedValue(['cat-new']);
    lib.getRunSummary.mockResolvedValue({
      target: 'cat-new',
      scope: 'category',
      startedAt: '2026-09-28T11:00:00.000Z',
      finishedAt: '2026-09-28T11:20:00.000Z',
      dryRun: false,
      totals: { scanned: 400, productsChanged: 9, added: 9, removed: 0 },
      sample: [],
      complete: true,
    });

    const result = await runSweepJob(apiRoot, config, 'run-1', NOW);

    expect(lib.sweepChunk.mock.calls[0][1].cursor).toBeUndefined();
    expect(result.targets[0].totals.scanned).toBe(10);
  });
});

describe('the periodic reconcile', () => {
  it('runs when nothing is queued and the interval has elapsed', async () => {
    lib.readSystemValue.mockResolvedValue({
      at: '2026-09-28T10:30:00.000Z',
    });

    const result = await runSweepJob(apiRoot, config, 'run-1', NOW);

    expect(result.targets[0]).toMatchObject({ scope: 'all', target: ALL_TARGET });
    expect(lib.writeSystemValue).toHaveBeenCalled();
  });

  it('holds off inside the interval', async () => {
    lib.readSystemValue.mockResolvedValue({
      at: '2026-09-28T11:50:00.000Z',
    });

    const result = await runSweepJob(apiRoot, config, 'run-1', NOW);

    expect(result.targets).toEqual([]);
    expect(lib.sweepChunk).not.toHaveBeenCalled();
  });

  it('runs the first time, before any marker exists', async () => {
    lib.readSystemValue.mockResolvedValue(undefined);

    const result = await runSweepJob(apiRoot, config, 'run-1', NOW);

    expect(result.targets[0].scope).toBe('all');
  });

  it('never runs when the interval is switched off', async () => {
    lib.readSystemValue.mockResolvedValue(undefined);

    const result = await runSweepJob(
      apiRoot,
      { ...config, fullReconcileMinutes: 0 },
      'run-1',
      NOW
    );

    expect(result.targets).toEqual([]);
  });

  it('gives way to the queue', async () => {
    lib.drainSweepQueue.mockResolvedValue(['cat-new']);
    lib.readSystemValue.mockResolvedValue(undefined);

    const result = await runSweepJob(apiRoot, config, 'run-1', NOW);

    expect(result.targets.map((t: { scope: string }) => t.scope)).toEqual([
      'category',
    ]);
    expect(lib.writeSystemValue).not.toHaveBeenCalled();
  });
});
