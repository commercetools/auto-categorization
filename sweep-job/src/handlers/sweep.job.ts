/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import {
  RECONCILE_MARKER_KEY,
  RunSummary,
  Rule,
  SweepTotals,
  acquireJobLock,
  drainSweepQueue,
  enqueueSweep,
  getRunSummary,
  listRules,
  loadEvaluationContext,
  readSystemValue,
  releaseJobLock,
  saveRunSummary,
  sweepChunk,
  writeSystemValue,
} from '../shared';
import { Config } from '../interfaces/config.interface';
import { logger } from '../utils/logger.utils';

/**
 * The scheduled pass.
 *
 * Two jobs in one. It drains the sweep queue — the categories the event
 * application and the rules API flagged as needing their rules re-applied
 * across the catalog. And when the queue is empty it reconciles everything,
 * on an interval, which is the backstop for a rule written straight through
 * the API where nothing signalled the change.
 *
 * Connect starts the next scheduled run whether or not this one finished,
 * so the whole thing sits behind a lease. A run that reaches its budget
 * checkpoints its cursor, puts the target back on the queue and stops; the
 * next tick resumes from there rather than starting the catalog again.
 */

export const ALL_TARGET = 'all';

export type JobResult = {
  ranAs: string;
  skipped?: 'locked';
  targets: Array<{
    target: string;
    scope: RunSummary['scope'];
    done: boolean;
    totals: SweepTotals;
  }>;
};

type LastReconcile = { at: string };

export async function runSweepJob(
  apiRoot: ByProjectKeyRequestBuilder,
  config: Config,
  runId: string,
  now: Date = new Date()
): Promise<JobResult> {
  const acquired = await acquireJobLock(
    apiRoot,
    runId,
    now,
    config.lockTtlMinutes
  );

  if (!acquired) {
    logger.warn({ message: 'A previous run still holds the lease', runId });
    return { ranAs: runId, skipped: 'locked', targets: [] };
  }

  // Measured against the wall clock the loop later checks, not against the
  // injected `now` — that one exists so the reconcile interval can be
  // reasoned about, and the two are the same value in production.
  const deadline = Date.now() + config.budgetMinutes * 60_000;
  const results: JobResult['targets'] = [];

  try {
    const queued = await drainSweepQueue(apiRoot);
    const targets = queued.length
      ? queued.map((categoryId) => ({
          scope: 'category' as const,
          target: categoryId,
        }))
      : (await isReconcileDue(apiRoot, config, now))
        ? [{ scope: 'all' as const, target: ALL_TARGET }]
        : [];

    if (targets.length === 0) {
      logger.info({ message: 'Nothing queued and no reconcile due', runId });
      return { ranAs: runId, targets: [] };
    }

    const rules = await listRules(apiRoot);
    const { ctx } = await loadEvaluationContext(apiRoot, now);

    for (const { scope, target } of targets) {
      if (Date.now() >= deadline) {
        // Out of time before this target was even started; put it back.
        if (scope === 'category') await enqueueSweep(apiRoot, target);
        continue;
      }

      const applicable =
        scope === 'category'
          ? rules.filter(
              (rule: Rule) => rule.enabled && rule.categoryId === target
            )
          : rules.filter((rule: Rule) => rule.enabled);

      if (applicable.length === 0) {
        logger.info({ message: 'No enabled rules for target', runId, target });
        continue;
      }

      const outcome = await sweepTarget(
        apiRoot,
        { scope, target, rules: applicable, ctx },
        config,
        deadline,
        runId
      );

      results.push({ scope, target, ...outcome });

      if (!outcome.done && scope === 'category') {
        await enqueueSweep(apiRoot, target);
      }
    }

    if (targets.some((t) => t.scope === 'all')) {
      await writeSystemValue<LastReconcile>(apiRoot, RECONCILE_MARKER_KEY, {
        at: new Date().toISOString(),
      });
    }

    return { ranAs: runId, targets: results };
  } finally {
    await releaseJobLock(apiRoot, runId);
  }
}

async function sweepTarget(
  apiRoot: ByProjectKeyRequestBuilder,
  target: {
    scope: RunSummary['scope'];
    target: string;
    rules: Rule[];
    ctx: Parameters<typeof sweepChunk>[1]['ctx'];
  },
  config: Config,
  deadline: number,
  runId: string
): Promise<{ done: boolean; totals: SweepTotals }> {
  // Resume where the last unfinished pass over this target stopped.
  const previous = await getRunSummary(apiRoot, target.scope, target.target);
  const resuming = previous?.complete === false ? previous : undefined;

  let cursor = resuming?.cursor;
  const startedAt = resuming?.startedAt ?? new Date().toISOString();
  const totals: SweepTotals = resuming?.totals ?? {
    scanned: 0,
    productsChanged: 0,
    added: 0,
    removed: 0,
  };
  const sample = resuming?.sample ? [...resuming.sample] : [];

  let done = false;

  while (!done && Date.now() < deadline) {
    const chunk = await sweepChunk(apiRoot, {
      rules: target.rules,
      ctx: target.ctx,
      cursor,
      pageSize: config.pageSize,
      maxPages: 5,
      deadline,
    });

    totals.scanned += chunk.totals.scanned;
    totals.productsChanged += chunk.totals.productsChanged;
    totals.added += chunk.totals.added;
    totals.removed += chunk.totals.removed;
    for (const change of chunk.changes) {
      if (sample.length < 25) sample.push(change);
    }

    cursor = chunk.cursor;
    done = chunk.done;

    // Checkpoint per chunk, not per run: a container killed mid-pass loses
    // a few pages of progress, which the next run simply redoes.
    await saveRunSummary(apiRoot, {
      target: target.target,
      scope: target.scope,
      startedAt,
      finishedAt: new Date().toISOString(),
      dryRun: false,
      totals,
      sample,
      cursor: done ? undefined : cursor,
      complete: done,
    });
  }

  logger.info({
    message: done ? 'Target swept' : 'Target checkpointed at the budget',
    runId,
    scope: target.scope,
    target: target.target,
    totals,
  });

  return { done, totals };
}

async function isReconcileDue(
  apiRoot: ByProjectKeyRequestBuilder,
  config: Config,
  now: Date
): Promise<boolean> {
  if (config.fullReconcileMinutes <= 0) return false;

  const marker = await readSystemValue<LastReconcile>(
    apiRoot,
    RECONCILE_MARKER_KEY
  );
  if (!marker) return true;

  const elapsed = now.getTime() - Date.parse(marker.at);
  return elapsed >= config.fullReconcileMinutes * 60_000;
}
