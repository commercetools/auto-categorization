/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import { EvaluationContext, loadEvaluationContext } from '../shared';

/**
 * Product Types and the Project's currencies change on the timescale of a
 * release, and a change notification arrives on the timescale of a keystroke.
 * Caching them for a few minutes turns two API calls per message into two
 * per container lifetime.
 *
 * This is a cache, not state: it is per-container, it never affects the
 * outcome, and a cold container simply reloads it. Rules are deliberately
 * not cached — a rule saved in the Merchant Center has to bite immediately.
 */

const TTL_MS = 5 * 60_000;

let cached: { at: number; ctx: EvaluationContext } | undefined;

export async function getEvaluationContext(
  apiRoot: ByProjectKeyRequestBuilder,
  now: Date = new Date()
): Promise<EvaluationContext> {
  if (cached && now.getTime() - cached.at < TTL_MS) {
    return { ...cached.ctx, now };
  }

  const { ctx } = await loadEvaluationContext(apiRoot, now);
  cached = { at: now.getTime(), ctx };
  return ctx;
}

export function resetEvaluationContextCache(): void {
  cached = undefined;
}
