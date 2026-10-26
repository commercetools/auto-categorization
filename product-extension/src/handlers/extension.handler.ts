/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Product, ProductUpdateAction } from '@commercetools/platform-sdk';
import type { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import type { ProductProjection } from '@commercetools/platform-sdk';
import {
  EvaluationContext,
  Rule,
  isNoop,
  planProduct,
  projectionFromProduct,
} from '../shared';

/**
 * The synchronous half of the connector.
 *
 * commercetools calls this in the middle of every product create and update,
 * after the caller's actions have been applied and before anything is
 * persisted. Returning `addToCategory` here means the product lands in its
 * rule-driven categories in the same write the merchandiser made — one
 * version bump, no second update, and the product is never briefly in the
 * wrong place.
 *
 * It also means this code is on the critical path of every product write in
 * the Project, including the Merchant Center's own. Two consequences run
 * through everything below: the work is a single API read plus pure
 * evaluation, and a failure returns no actions rather than an error.
 */

export type ExtensionInput = {
  action: 'Create' | 'Update';
  resource: { typeId: string; id: string; obj?: Product };
};

export class BadExtensionInputError extends Error {
  constructor(reason: string) {
    super(`Malformed extension input: ${reason}`);
    this.name = 'BadExtensionInputError';
  }
}

export function parseExtensionInput(body: unknown): ExtensionInput {
  const input = body as Partial<ExtensionInput> | undefined;

  if (input?.action !== 'Create' && input?.action !== 'Update') {
    throw new BadExtensionInputError('action must be Create or Update');
  }
  if (!input.resource?.typeId || !input.resource?.id) {
    throw new BadExtensionInputError('no resource reference');
  }
  if (input.resource.typeId !== 'product') {
    throw new BadExtensionInputError(
      `resource type ${input.resource.typeId} is not product`
    );
  }
  if (!input.resource.obj?.masterData) {
    throw new BadExtensionInputError('no product in the payload');
  }

  return input as ExtensionInput;
}

export type ExtensionOutcome = {
  actions: ProductUpdateAction[];
  added: string[];
  removed: string[];
  rulesConsidered: number;
};

export async function decideActions(
  input: ExtensionInput,
  loadRules: () => Promise<Rule[]>,
  loadContext: () => Promise<EvaluationContext>,
  now: Date = new Date()
): Promise<ExtensionOutcome> {
  const product = input.resource.obj as Product;

  const rules = (await loadRules()).filter((rule) => rule.enabled);
  if (rules.length === 0) {
    return { actions: [], added: [], removed: [], rulesConsidered: 0 };
  }

  // The payload is the product as it will be persisted, so it is already
  // the state to judge — there is nothing to re-fetch and nothing staler
  // than this request. With one exception, and it matters: commercetools
  // documents that `lastModifiedAt`, and on a create `createdAt`, do not
  // carry their final values here. Left alone, the most obvious rule
  // anyone writes — everything added in the last 30 days — never fires on
  // the write that adds the product, and the product waits for a sweep.
  const projection = withRequestTimestamps(
    projectionFromProduct(product, 'staged'),
    input.action,
    now
  );
  const plan = planProduct(projection, rules, await loadContext());

  if (isNoop(plan)) {
    return { actions: [], added: [], removed: [], rulesConsidered: rules.length };
  }

  return {
    actions: plan.actions,
    added: plan.added,
    removed: plan.removed,
    rulesConsidered: rules.length,
  };
}

/**
 * The timestamps as they will be once this request is persisted.
 *
 * A create is happening now, so `createdAt` is now — the payload's value
 * is a placeholder. Every write sets `lastModifiedAt` to now for the same
 * reason. Anything a rule reads has to be the value the product ends up
 * with, or the rule and the catalog disagree the moment the write lands.
 */
export function withRequestTimestamps(
  projection: ProductProjection,
  action: ExtensionInput['action'],
  now: Date
): ProductProjection {
  const timestamp = now.toISOString();
  return {
    ...projection,
    createdAt: action === 'Create' ? timestamp : projection.createdAt,
    lastModifiedAt: timestamp,
  };
}

/**
 * Rules are read once per request so a rule saved in the Merchant Center
 * takes effect on the very next product write. A short cache keeps a bulk
 * import from turning one read per product into the thing that blows the
 * Extension's time budget.
 */
export function createRuleLoader(
  apiRoot: ByProjectKeyRequestBuilder,
  listRules: (root: ByProjectKeyRequestBuilder) => Promise<Rule[]>,
  ttlMs: number,
  clock: () => number = Date.now
): () => Promise<Rule[]> {
  let cached: { at: number; rules: Rule[] } | undefined;
  let inFlight: Promise<Rule[]> | undefined;

  return async () => {
    const now = clock();
    if (cached && now - cached.at < ttlMs) return cached.rules;
    if (inFlight) return inFlight;

    inFlight = listRules(apiRoot)
      .then((rules) => {
        cached = { at: clock(), rules };
        return rules;
      })
      .finally(() => {
        inFlight = undefined;
      });

    return inFlight;
  };
}
