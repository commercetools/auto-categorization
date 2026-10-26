/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createApiRoot } from '../client/create.client';
import { assertError } from '../utils/assert.utils';
import { EXTENSION_KEY, deleteExtension } from './actions';

/**
 * Remove the Extension before the endpoint disappears. An Extension left
 * registered against a dead URL is worse than no connector at all: every
 * product create and update in the Project starts failing.
 */
async function run(): Promise<void> {
  try {
    const removed = await deleteExtension(createApiRoot());
    process.stdout.write(
      removed
        ? `Extension ${EXTENSION_KEY} removed\n`
        : `Extension ${EXTENSION_KEY} was already absent\n`
    );
  } catch (error) {
    assertError(error);
    process.stderr.write(`Pre-undeploy failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

run();
