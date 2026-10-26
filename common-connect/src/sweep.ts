/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import { applyPlan, isNoop, planProduct } from './reconcile';
import { EvaluationContext, ProductChange, Rule, SweepTotals } from './types';

/**
 * The catalog pass.
 *
 * Resumable by design: a chunk reads a bounded number of pages, returns where
 * it got to, and can be called again with that cursor. The same function
 * therefore serves the Process now button in the Merchant Center — which
 * calls it repeatedly and draws a progress bar — and the scheduled job, which
 * calls it until its own deadline and resumes on the next tick.
 *
 * Pagination is keyset on product id, never offset: a sweep writes to the
 * products it is walking, and offset pagination re-orders under a concurrent
 * write and silently skips rows.
 */

export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_MAX_PAGES = 5;
const MAX_SAMPLE = 25;

export type SweepChunkOptions = {
  rules: Rule[];
  ctx: EvaluationContext;
  /** Last product id of the previous chunk. */
  cursor?: string;
  pageSize?: number;
  maxPages?: number;
  /** Epoch milliseconds to stop by, whatever the page budget says. */
  deadline?: number;
  /** Compute everything, write nothing. */
  dryRun?: boolean;
};

export type SweepChunkResult = {
  cursor?: string;
  done: boolean;
  totals: SweepTotals;
  changes: ProductChange[];
};

export async function sweepChunk(
  apiRoot: ByProjectKeyRequestBuilder,
  options: SweepChunkOptions
): Promise<SweepChunkResult> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;

  const totals: SweepTotals = {
    scanned: 0,
    productsChanged: 0,
    added: 0,
    removed: 0,
  };
  const changes: ProductChange[] = [];

  let cursor = options.cursor;
  let done = false;

  for (let page = 0; page < maxPages; page++) {
    const { body } = await apiRoot
      .productProjections()
      .get({
        queryArgs: {
          // Staged, so a product that has never been published is still
          // reachable by a rule — "everything added this week" has to mean
          // everything.
          staged: true,
          limit: pageSize,
          sort: ['id asc'],
          withTotal: false,
          ...(cursor ? { where: `id > "${cursor}"` } : {}),
        },
      })
      .execute();

    const products = body.results;
    if (products.length === 0) {
      done = true;
      break;
    }

    for (const product of products) {
      totals.scanned++;
      const plan = planProduct(product, options.rules, options.ctx);
      if (isNoop(plan)) continue;

      if (!options.dryRun) {
        await applyPlan(apiRoot, plan);
      }

      totals.productsChanged++;
      totals.added += plan.added.length;
      totals.removed += plan.removed.length;

      if (changes.length < MAX_SAMPLE) {
        changes.push({
          productId: plan.productId,
          productKey: plan.productKey,
          added: plan.added,
          removed: plan.removed,
        });
      }
    }

    cursor = products[products.length - 1].id;

    if (products.length < pageSize) {
      done = true;
      break;
    }
    if (options.deadline && Date.now() >= options.deadline) break;
  }

  return { cursor, done, totals, changes };
}

/** Run chunks back to back until the catalog is exhausted or time runs out. */
export async function sweepAll(
  apiRoot: ByProjectKeyRequestBuilder,
  options: SweepChunkOptions
): Promise<SweepChunkResult> {
  const totals: SweepTotals = {
    scanned: 0,
    productsChanged: 0,
    added: 0,
    removed: 0,
  };
  const changes: ProductChange[] = [];

  let cursor = options.cursor;
  let done = false;

  while (!done) {
    const chunk = await sweepChunk(apiRoot, { ...options, cursor });
    totals.scanned += chunk.totals.scanned;
    totals.productsChanged += chunk.totals.productsChanged;
    totals.added += chunk.totals.added;
    totals.removed += chunk.totals.removed;
    for (const change of chunk.changes) {
      if (changes.length < MAX_SAMPLE) changes.push(change);
    }

    cursor = chunk.cursor;
    done = chunk.done;

    if (!done && options.deadline && Date.now() >= options.deadline) break;
  }

  return { cursor, done, totals, changes };
}
