/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createApiRoot } from '../client/create.client';
import { assertError } from '../utils/assert.utils';
import { SUBSCRIPTION_KEY, deleteSubscription } from './actions';

/**
 * Remove the Subscription. Rules and run history are Project data and stay
 * where they are, so reinstalling the connector picks up exactly where it
 * left off.
 */
async function run(): Promise<void> {
  try {
    const removed = await deleteSubscription(createApiRoot());
    process.stdout.write(
      removed
        ? `Subscription ${SUBSCRIPTION_KEY} removed\n`
        : `Subscription ${SUBSCRIPTION_KEY} was already absent\n`
    );
  } catch (error) {
    assertError(error);
    process.stderr.write(`Pre-undeploy failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

run();
