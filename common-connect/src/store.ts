/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import type { CustomObject } from '@commercetools/platform-sdk';
import { Rule, RunSummary } from './types';

/**
 * Where rules live.
 *
 * Custom Objects, because a rule is Project data rather than connector data:
 * it survives an undeploy, it is visible in the Merchant Center under
 * Settings, and it needs no schema migration to gain a field. Every write
 * carries the document's version, so two editors racing produce a 409 rather
 * than a silent overwrite.
 */

export const RULE_CONTAINER = 'auto-categorization-rules';
export const RUN_CONTAINER = 'auto-categorization-runs';
export const SYSTEM_CONTAINER = 'auto-categorization-system';

export const SWEEP_QUEUE_KEY = 'sweep-queue';
export const JOB_LOCK_KEY = 'job-lock';
export const RECONCILE_MARKER_KEY = 'last-full-reconcile';

const PAGE_SIZE = 200;

export type SweepQueue = { categoryIds: string[] };
export type JobLock = { owner: string; expiresAt: string };

export type VersionedValue<T> = { value: T; version: number };

export async function listRules(
  apiRoot: ByProjectKeyRequestBuilder
): Promise<Rule[]> {
  const rules: Rule[] = [];
  let lastId: string | undefined;

  // Keyset pagination on id: stable while rules are being edited, and never
  // hits the offset ceiling.
  for (;;) {
    const { body } = await apiRoot
      .customObjects()
      .withContainer({ container: RULE_CONTAINER })
      .get({
        queryArgs: {
          limit: PAGE_SIZE,
          sort: ['id asc'],
          withTotal: false,
          ...(lastId ? { where: `id > "${lastId}"` } : {}),
        },
      })
      .execute();

    if (body.results.length === 0) break;
    rules.push(...body.results.map((object) => object.value as Rule));
    lastId = body.results[body.results.length - 1].id;
    if (body.results.length < PAGE_SIZE) break;
  }

  return rules;
}

export async function getRule(
  apiRoot: ByProjectKeyRequestBuilder,
  key: string
): Promise<Rule | undefined> {
  const object = await readObject(apiRoot, RULE_CONTAINER, key);
  return object ? (object.value as Rule) : undefined;
}

export async function saveRule(
  apiRoot: ByProjectKeyRequestBuilder,
  rule: Rule
): Promise<Rule> {
  const { body } = await apiRoot
    .customObjects()
    .post({ body: { container: RULE_CONTAINER, key: rule.key, value: rule } })
    .execute();

  return body.value as Rule;
}

export async function deleteRule(
  apiRoot: ByProjectKeyRequestBuilder,
  key: string
): Promise<boolean> {
  const object = await readObject(apiRoot, RULE_CONTAINER, key);
  if (!object) return false;

  await apiRoot
    .customObjects()
    .withContainerAndKey({ container: RULE_CONTAINER, key })
    .delete({ queryArgs: { version: object.version } })
    .execute();

  return true;
}

export async function saveRunSummary(
  apiRoot: ByProjectKeyRequestBuilder,
  summary: RunSummary
): Promise<void> {
  await apiRoot
    .customObjects()
    .post({
      body: {
        container: RUN_CONTAINER,
        key: runKey(summary.scope, summary.target),
        value: summary,
      },
    })
    .execute();
}

export async function getRunSummary(
  apiRoot: ByProjectKeyRequestBuilder,
  scope: RunSummary['scope'],
  target: string
): Promise<RunSummary | undefined> {
  const object = await readObject(
    apiRoot,
    RUN_CONTAINER,
    runKey(scope, target)
  );
  return object ? (object.value as RunSummary) : undefined;
}

export function runKey(scope: RunSummary['scope'], target: string): string {
  return scope === 'rule' ? target : `${scope}--${target}`;
}

/**
 * Ask for a category to be swept.
 *
 * The event application cannot sweep the catalog itself — a change
 * notification must be acknowledged within 10 seconds — so it records the
 * request here and the job application drains it. Writing with the document's
 * version means a concurrent enqueue loses the race and retries rather than
 * dropping the other one's category.
 */
export async function enqueueSweep(
  apiRoot: ByProjectKeyRequestBuilder,
  categoryId: string,
  attempts = 5
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const current = await readObject(apiRoot, SYSTEM_CONTAINER, SWEEP_QUEUE_KEY);
    const queue = (current?.value as SweepQueue | undefined) ?? {
      categoryIds: [],
    };

    if (queue.categoryIds.includes(categoryId)) return;

    try {
      await apiRoot
        .customObjects()
        .post({
          body: {
            container: SYSTEM_CONTAINER,
            key: SWEEP_QUEUE_KEY,
            value: { categoryIds: [...queue.categoryIds, categoryId] },
            ...(current ? { version: current.version } : {}),
          },
        })
        .execute();
      return;
    } catch (error) {
      if (!isConflict(error) || attempt === attempts - 1) throw error;
    }
  }
}

/** Take everything currently queued, leaving the queue empty. */
export async function drainSweepQueue(
  apiRoot: ByProjectKeyRequestBuilder,
  attempts = 5
): Promise<string[]> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const current = await readObject(apiRoot, SYSTEM_CONTAINER, SWEEP_QUEUE_KEY);
    const queue = (current?.value as SweepQueue | undefined) ?? {
      categoryIds: [],
    };
    if (queue.categoryIds.length === 0) return [];

    try {
      await apiRoot
        .customObjects()
        .post({
          body: {
            container: SYSTEM_CONTAINER,
            key: SWEEP_QUEUE_KEY,
            value: { categoryIds: [] },
            ...(current ? { version: current.version } : {}),
          },
        })
        .execute();
      return queue.categoryIds;
    } catch (error) {
      if (!isConflict(error) || attempt === attempts - 1) throw error;
    }
  }
  return [];
}

/**
 * Connect starts a scheduled run whether or not the last one finished, so
 * mutual exclusion is ours to provide. The lease outlives the job's
 * 30-minute timeout, which means a crashed run blocks the next tick and then
 * expires on its own instead of wedging the job for good.
 */
export async function acquireJobLock(
  apiRoot: ByProjectKeyRequestBuilder,
  owner: string,
  now: Date,
  ttlMinutes = 35
): Promise<boolean> {
  const current = await readObject(apiRoot, SYSTEM_CONTAINER, JOB_LOCK_KEY);
  const lock = current?.value as JobLock | undefined;

  if (lock && Date.parse(lock.expiresAt) > now.getTime()) return false;

  const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();

  try {
    await apiRoot
      .customObjects()
      .post({
        body: {
          container: SYSTEM_CONTAINER,
          key: JOB_LOCK_KEY,
          value: { owner, expiresAt },
          ...(current ? { version: current.version } : {}),
        },
      })
      .execute();
    return true;
  } catch (error) {
    if (isConflict(error)) return false;
    throw error;
  }
}

export async function releaseJobLock(
  apiRoot: ByProjectKeyRequestBuilder,
  owner: string
): Promise<void> {
  const current = await readObject(apiRoot, SYSTEM_CONTAINER, JOB_LOCK_KEY);
  const lock = current?.value as JobLock | undefined;
  if (!current || lock?.owner !== owner) return;

  await apiRoot
    .customObjects()
    .withContainerAndKey({ container: SYSTEM_CONTAINER, key: JOB_LOCK_KEY })
    .delete({ queryArgs: { version: current.version } })
    .execute();
}

export async function readSystemValue<T>(
  apiRoot: ByProjectKeyRequestBuilder,
  key: string
): Promise<T | undefined> {
  const object = await readObject(apiRoot, SYSTEM_CONTAINER, key);
  return object ? (object.value as T) : undefined;
}

export async function writeSystemValue<T>(
  apiRoot: ByProjectKeyRequestBuilder,
  key: string,
  value: T
): Promise<void> {
  await apiRoot
    .customObjects()
    .post({ body: { container: SYSTEM_CONTAINER, key, value } })
    .execute();
}

async function readObject(
  apiRoot: ByProjectKeyRequestBuilder,
  container: string,
  key: string
): Promise<CustomObject | undefined> {
  try {
    const { body } = await apiRoot
      .customObjects()
      .withContainerAndKey({ container, key })
      .get()
      .execute();
    return body;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

function statusOf(error: unknown): number | undefined {
  const candidate = error as { statusCode?: number; status?: number };
  return candidate?.statusCode ?? candidate?.status;
}

export function isNotFound(error: unknown): boolean {
  return statusOf(error) === 404;
}

export function isConflict(error: unknown): boolean {
  return statusOf(error) === 409;
}
