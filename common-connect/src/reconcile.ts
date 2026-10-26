/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import type {
  ProductProjection,
  ProductUpdateAction,
} from '@commercetools/platform-sdk';
import { evaluateRule } from './engine';
import { stagedFlagFor } from './product';
import { EvaluationContext, ProductChange, Rule } from './types';

/**
 * Turning rule matches into category membership for one product.
 *
 * A category that has rules has computed membership: the products that match
 * belong in it, and the products that stop matching leave it. That is the
 * whole contract, and it is what makes the result predictable — a
 * merchandiser can read a rule and know what the category contains.
 *
 * Only categories named by the rules in hand are touched. Every other
 * category on the product, however it got there, is left exactly as it is.
 */

export type ProductPlan = {
  productId: string;
  productKey?: string;
  version: number;
  added: string[];
  removed: string[];
  /** Whether the actions touch the staged projection alone. */
  staged: boolean;
  actions: ProductUpdateAction[];
};

export function planProduct(
  product: ProductProjection,
  rules: Rule[],
  ctx: EvaluationContext
): ProductPlan {
  const enabled = rules.filter((rule) => rule.enabled);
  const managedCategories = new Set(enabled.map((rule) => rule.categoryId));
  const current = new Set(product.categories.map((ref) => ref.id));

  const added: string[] = [];
  const removed: string[] = [];

  for (const categoryId of managedCategories) {
    const rulesForCategory = enabled.filter(
      (rule) => rule.categoryId === categoryId
    );
    const matches = rulesForCategory.some((rule) =>
      evaluateRule(product, rule, ctx)
    );

    if (matches && !current.has(categoryId)) {
      added.push(categoryId);
      continue;
    }

    const removable = rulesForCategory.some(
      (rule) => rule.removeWhenNoLongerMatching
    );
    if (!matches && current.has(categoryId) && removable) {
      removed.push(categoryId);
    }
  }

  const staged = stagedFlagFor(product);

  return {
    productId: product.id,
    productKey: product.key,
    version: product.version,
    added,
    removed,
    staged,
    actions: [
      ...added.map(
        (id): ProductUpdateAction => ({
          action: 'addToCategory',
          category: { typeId: 'category', id },
          staged,
        })
      ),
      ...removed.map(
        (id): ProductUpdateAction => ({
          action: 'removeFromCategory',
          category: { typeId: 'category', id },
          staged,
        })
      ),
    ],
  };
}

export function isNoop(plan: ProductPlan): boolean {
  return plan.actions.length === 0;
}

/**
 * Applying a plan is idempotent by construction: it is derived from the
 * product's live category list, so a redelivered message or an overlapping
 * sweep recomputes an empty plan and writes nothing. That is also what stops
 * the write from looping — the product update this issues produces a change
 * notification whose own plan is empty.
 */
export async function applyPlan(
  apiRoot: ByProjectKeyRequestBuilder,
  plan: ProductPlan
): Promise<ProductChange | undefined> {
  if (isNoop(plan)) return undefined;

  await apiRoot
    .products()
    .withId({ ID: plan.productId })
    .post({ body: { version: plan.version, actions: plan.actions } })
    .execute();

  return {
    productId: plan.productId,
    productKey: plan.productKey,
    added: plan.added,
    removed: plan.removed,
  };
}
