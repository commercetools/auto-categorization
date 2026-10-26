/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import { Rule, enqueueSweep, listRules } from '../shared';
import { ChangeNotification } from './envelope';
import { logger } from '../utils/logger.utils';

/**
 * What one category change does.
 *
 * Re-applying a category's rules means walking the catalog, which is minutes
 * of work — and a change notification has ten seconds to be acknowledged. So
 * this records the request on the sweep queue and returns; the job
 * application drains it. Queueing is idempotent, so a redelivered
 * notification adds nothing.
 *
 * Products are not handled here at all. The Product API Extension assigns
 * their categories inside the product write itself, so by the time any
 * notification could arrive the work is already done.
 */

export type Outcome =
  | { status: 'queued'; categoryId: string }
  | { status: 'ignored'; reason: string };

export async function handleChange(
  apiRoot: ByProjectKeyRequestBuilder,
  notification: ChangeNotification
): Promise<Outcome> {
  const { typeId, id } = notification.resource;

  if (
    notification.notificationType !== 'ResourceCreated' &&
    notification.notificationType !== 'ResourceUpdated'
  ) {
    return { status: 'ignored', reason: notification.notificationType };
  }

  // Includes the Subscription's own test notification, which arrives as a
  // ResourceCreated for typeId "subscription".
  if (typeId !== 'category') {
    return { status: 'ignored', reason: `resource type ${typeId}` };
  }

  const rules = await listRules(apiRoot);
  const affected = rules.some(
    (rule: Rule) => rule.enabled && rule.categoryId === id
  );

  if (!affected) {
    return { status: 'ignored', reason: 'no enabled rules for this category' };
  }

  await enqueueSweep(apiRoot, id);
  logger.info({ message: 'Category sweep queued', categoryId: id });

  return { status: 'queued', categoryId: id };
}
