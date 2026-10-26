/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import {
  EvaluationContext,
  ProductChange,
  RunSummary,
  Rule,
  SweepTotals,
  getRunSummary,
  saveRunSummary,
  sweepChunk,
} from '../shared';

/**
 * Process now, one chunk at a time.
 *
 * A catalog pass is unbounded work behind a button, so it is served in
 * chunks: each request walks a fixed number of pages, writes what it found,
 * and hands back a cursor. The Merchant Center calls again with that cursor
 * and draws a progress bar out of the running totals. Nothing sits in
 * memory between calls, so a closed browser tab leaves no half-finished run
 * and a resumed one picks up exactly where it stopped.
 *
 * The running totals live in the same Custom Object the last run is read
 * from, which is what lets the category panel show progress for a run
 * somebody else started.
 */

const MAX_SAMPLE = 25;

export type RunRequest = {
  scope: RunSummary['scope'];
  target: string;
  rules: Rule[];
  ctx: EvaluationContext;
  cursor?: string;
  dryRun?: boolean;
  pageSize: number;
  maxPages: number;
  budgetSeconds: number;
};

export type RunResponse = {
  cursor?: string;
  done: boolean;
  totals: SweepTotals;
  sample: ProductChange[];
  startedAt: string;
};

export async function runChunk(
  apiRoot: ByProjectKeyRequestBuilder,
  req: RunRequest,
  now: Date = new Date()
): Promise<RunResponse> {
  const previous = req.cursor
    ? await getRunSummary(apiRoot, req.scope, req.target)
    : undefined;

  // A run without a cursor is a fresh start, whatever came before it.
  const startedAt =
    req.cursor && previous ? previous.startedAt : now.toISOString();
  const carried: SweepTotals =
    req.cursor && previous
      ? previous.totals
      : { scanned: 0, productsChanged: 0, added: 0, removed: 0 };
  const carriedSample = req.cursor && previous ? previous.sample : [];

  const chunk = await sweepChunk(apiRoot, {
    rules: req.rules,
    ctx: req.ctx,
    cursor: req.cursor,
    pageSize: req.pageSize,
    maxPages: req.maxPages,
    deadline: now.getTime() + req.budgetSeconds * 1000,
    dryRun: req.dryRun,
  });

  const totals: SweepTotals = {
    scanned: carried.scanned + chunk.totals.scanned,
    productsChanged: carried.productsChanged + chunk.totals.productsChanged,
    added: carried.added + chunk.totals.added,
    removed: carried.removed + chunk.totals.removed,
  };

  const sample = [...carriedSample, ...chunk.changes].slice(0, MAX_SAMPLE);

  const summary: RunSummary = {
    target: req.target,
    scope: req.scope,
    startedAt,
    finishedAt: new Date().toISOString(),
    dryRun: Boolean(req.dryRun),
    totals,
    sample,
  };

  await saveRunSummary(apiRoot, summary);

  return {
    cursor: chunk.done ? undefined : chunk.cursor,
    done: chunk.done,
    totals,
    sample,
    startedAt,
  };
}
