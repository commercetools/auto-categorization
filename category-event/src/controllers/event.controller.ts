/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Request, Response } from 'express';
import { createApiRoot } from '../client/create.client';
import { logger } from '../utils/logger.utils';
import { isTransientError } from '../utils/errors.utils';
import {
  BadEnvelopeError,
  correlationId,
  decodeEnvelope,
} from '../handlers/envelope';
import { handleChange } from '../handlers/change.handler';

/**
 * The acknowledgement contract, in one place.
 *
 * 204  handled, or deliberately ignored — do not send it again
 * 200  unprocessable; redelivery cannot help, so acknowledge and log
 * 503  transient; put it back on the queue
 *
 * Anything outside 102/200/201/202/204 is a negative acknowledgement, so the
 * difference between 200 and 503 here is the difference between dropping a
 * message and looping on it for seven days.
 */
export const post = async (request: Request, response: Response) => {
  let notification;

  try {
    notification = decodeEnvelope(request.body);
  } catch (error) {
    if (error instanceof BadEnvelopeError) {
      logger.error({ message: error.message });
      response.status(200).send({ acknowledged: true, reason: error.message });
      return;
    }
    throw error;
  }

  const correlation = correlationId(notification);

  try {
    const outcome = await handleChange(createApiRoot(), notification);
    logger.info({ message: 'Category change handled', correlation, ...outcome });
    response.status(204).send();
  } catch (error) {
    if (isTransientError(error)) {
      logger.warn({
        message: 'Transient failure, requesting redelivery',
        correlation,
        error: error instanceof Error ? error.message : String(error),
      });
      response.status(503).send();
      return;
    }

    logger.error({
      message: 'Permanently unprocessable change',
      correlation,
      error: error instanceof Error ? error.message : String(error),
    });
    response.status(200).send({ acknowledged: true });
  }
};

export const status = (_request: Request, response: Response) => {
  response.status(200).send({ status: 'ok' });
};
