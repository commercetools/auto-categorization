/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Request, Response } from 'express';
import { listRules } from '../shared';
import { createApiRoot } from '../client/create.client';
import { logger } from '../utils/logger.utils';
import { readConfiguration } from '../utils/config.utils';
import { getEvaluationContext } from '../utils/context.cache';
import {
  BadExtensionInputError,
  createRuleLoader,
  decideActions,
  parseExtensionInput,
} from '../handlers/extension.handler';

/**
 * Fail open, always.
 *
 * An Extension that returns an error fails the API call it was extending, so
 * a bug here would stop every product save in the Project — including the
 * Merchant Center's. A rule that does not fire is a product in the wrong
 * category until the next sweep; an Extension that errors is a catalog
 * nobody can edit. The first is recoverable, so that is the side to fail on.
 */
let ruleLoader: ReturnType<typeof createRuleLoader> | undefined;

function rules() {
  if (!ruleLoader) {
    ruleLoader = createRuleLoader(
      createApiRoot(),
      listRules,
      readConfiguration().ruleCacheSeconds * 1000
    );
  }
  return ruleLoader;
}

export const post = async (request: Request, response: Response) => {
  const correlationId = request.header('x-correlation-id');
  const startedAt = Date.now();

  let input;
  try {
    input = parseExtensionInput(request.body);
  } catch (error) {
    if (error instanceof BadExtensionInputError) {
      logger.warn({ message: error.message, correlationId });
      response.status(200).send({ actions: [] });
      return;
    }
    throw error;
  }

  try {
    const apiRoot = createApiRoot();
    const outcome = await decideActions(input, rules(), () =>
      getEvaluationContext(apiRoot)
    );

    if (outcome.actions.length > 0) {
      logger.info({
        message: 'Product extension assigned categories',
        correlationId,
        productId: input.resource.id,
        action: input.action,
        added: outcome.added,
        removed: outcome.removed,
        durationMs: Date.now() - startedAt,
      });
    }

    response.status(200).send({ actions: outcome.actions });
  } catch (error) {
    logger.error({
      message: 'Product extension failed; letting the write through unchanged',
      correlationId,
      productId: input.resource.id,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    response.status(200).send({ actions: [] });
  }
};

export const status = (_request: Request, response: Response) => {
  response.status(200).send({ status: 'ok' });
};
