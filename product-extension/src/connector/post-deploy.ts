/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createApiRoot } from '../client/create.client';
import { assertError } from '../utils/assert.utils';
import { readConfiguration } from '../utils/config.utils';
import { EXTENSION_KEY, ensureExtension } from './actions';

/**
 * Register the Product Extension, then read it back.
 *
 * A failing post-deploy script does not reliably mark the deployment as
 * failed, so querying for the Extension afterwards is the only thing that
 * proves it is really there. Without that proof a deployment looks healthy
 * while no rule ever fires.
 */
async function run(): Promise<void> {
  try {
    const config = readConfiguration();
    const apiRoot = createApiRoot();

    const outcome = await ensureExtension(apiRoot, config);
    process.stdout.write(`Extension ${EXTENSION_KEY}: ${outcome}\n`);

    const {
      body: { results },
    } = await apiRoot
      .extensions()
      .get({ queryArgs: { where: `key = "${EXTENSION_KEY}"` } })
      .execute();

    if (results.length === 0) {
      throw new Error(
        `Extension ${EXTENSION_KEY} is not registered after post-deploy`
      );
    }

    const registered = results[0];
    process.stdout.write(
      `Extension ${EXTENSION_KEY} confirmed at ${
        registered.destination.type === 'HTTP'
          ? registered.destination.url
          : registered.destination.type
      } with a ${registered.timeoutInMs ?? 'default'} ms budget\n`
    );
  } catch (error) {
    assertError(error);
    process.stderr.write(`Post-deploy failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

run();
