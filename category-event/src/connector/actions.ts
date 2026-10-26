/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import type { SubscriptionDraft } from '@commercetools/platform-sdk';
import { assertNonNullable } from '../utils/assert.utils';
import { Config } from '../interfaces/config.interface';

export const SUBSCRIPTION_KEY = 'auto-categorization-category-changes';

/**
 * One Change Subscription, over categories alone.
 *
 * Products do not need one: the Product API Extension already assigns their
 * categories inside the write itself, synchronously and atomically. What is
 * left is the other direction — a category whose rules have just changed,
 * where the products that should move are scattered across the catalog and
 * no single write triggers them.
 *
 * Change rather than Message, because there is no Message for "this
 * category's rules changed"; any touch on the category is the signal.
 */
const CHANGES: SubscriptionDraft['changes'] = [{ resourceTypeId: 'category' }];

export function buildDestination(
  config: Config
): SubscriptionDraft['destination'] {
  if (config.connectSubscriptionDestination === 'SNS') {
    assertNonNullable(
      config.connectAwsTopicArn,
      'AWS Topic ARN must be provided for the SNS destination'
    );
    return {
      type: 'SNS',
      topicArn: config.connectAwsTopicArn,
      authenticationMode: 'IAM',
    };
  }

  if (
    config.connectSubscriptionDestination === 'GoogleCloudPubSub' ||
    config.connectSubscriptionDestination == null
  ) {
    assertNonNullable(
      config.connectGcpTopicName,
      'GCP topic name must be provided for the Google Cloud Pub/Sub destination'
    );
    assertNonNullable(
      config.connectGcpProjectId,
      'GCP project id must be provided for the Google Cloud Pub/Sub destination'
    );
    return {
      type: 'GoogleCloudPubSub',
      topic: config.connectGcpTopicName,
      projectId: config.connectGcpProjectId,
    };
  }

  throw new Error(
    `Unknown subscription destination type: ${config.connectSubscriptionDestination}`
  );
}

/**
 * Converge on the Subscription rather than replacing it. A redeploy re-runs
 * this, and delete-then-create drops every change emitted in between.
 */
export async function ensureSubscription(
  apiRoot: ByProjectKeyRequestBuilder,
  config: Config
): Promise<'created' | 'updated' | 'unchanged'> {
  const destination = buildDestination(config);

  const {
    body: { results },
  } = await apiRoot
    .subscriptions()
    .get({ queryArgs: { where: `key = "${SUBSCRIPTION_KEY}"` } })
    .execute();

  if (results.length === 0) {
    await apiRoot
      .subscriptions()
      .post({ body: { key: SUBSCRIPTION_KEY, destination, changes: CHANGES } })
      .execute();
    return 'created';
  }

  const current = results[0];
  const sameDestination =
    JSON.stringify(current.destination) === JSON.stringify(destination);
  const sameChanges =
    JSON.stringify(current.changes ?? []) === JSON.stringify(CHANGES);

  if (sameDestination && sameChanges) return 'unchanged';

  await apiRoot
    .subscriptions()
    .withKey({ key: SUBSCRIPTION_KEY })
    .post({
      body: {
        version: current.version,
        actions: [
          ...(sameDestination
            ? []
            : [{ action: 'changeDestination' as const, destination }]),
          ...(sameChanges
            ? []
            : [{ action: 'setChanges' as const, changes: CHANGES }]),
        ],
      },
    })
    .execute();

  return 'updated';
}

export async function deleteSubscription(
  apiRoot: ByProjectKeyRequestBuilder
): Promise<boolean> {
  const {
    body: { results },
  } = await apiRoot
    .subscriptions()
    .get({ queryArgs: { where: `key = "${SUBSCRIPTION_KEY}"` } })
    .execute();

  if (results.length === 0) return false;

  await apiRoot
    .subscriptions()
    .withKey({ key: SUBSCRIPTION_KEY })
    .delete({ queryArgs: { version: results[0].version } })
    .execute();

  return true;
}
