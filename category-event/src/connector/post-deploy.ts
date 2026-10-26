/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createApiRoot } from '../client/create.client';
import { assertError } from '../utils/assert.utils';
import { readConfiguration } from '../utils/config.utils';
import { SUBSCRIPTION_KEY, ensureSubscription } from './actions';

/**
 * Register the Change Subscription against the broker Connect provisioned
 * for this deployment, then read it back. A post-deploy script that fails
 * does not reliably fail the deployment, so the only honest proof that the
 * registration happened is querying for it.
 */
async function run(): Promise<void> {
  try {
    const config = readConfiguration();
    const apiRoot = createApiRoot();

    const outcome = await ensureSubscription(apiRoot, config);
    process.stdout.write(`Subscription ${SUBSCRIPTION_KEY}: ${outcome}\n`);

    const {
      body: { results },
    } = await apiRoot
      .subscriptions()
      .get({ queryArgs: { where: `key = "${SUBSCRIPTION_KEY}"` } })
      .execute();

    if (results.length === 0) {
      throw new Error(
        `Subscription ${SUBSCRIPTION_KEY} is not registered after post-deploy`
      );
    }

    process.stdout.write(
      `Subscription ${SUBSCRIPTION_KEY} confirmed (status ${results[0].status})\n`
    );
  } catch (error) {
    assertError(error);
    process.stderr.write(`Post-deploy failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

run();
