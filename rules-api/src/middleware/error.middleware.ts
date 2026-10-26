/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { RuleValidationError } from '../shared';
import CustomError from '../errors/custom.error';
import { logger } from '../utils/logger.utils';

/**
 * A rejected rule is the caller's mistake and they need to see why, so its
 * issues come back in full. Anything else is ours, and the caller gets a
 * generic message while the detail goes to the log.
 */
export const errorMiddleware: ErrorRequestHandler = (
  error: Error,
  _request: Request,
  response: Response,
  _next: NextFunction
) => {
  if (error instanceof RuleValidationError) {
    response.status(400).json({ message: 'Invalid rule', issues: error.issues });
    return;
  }

  if (error instanceof CustomError) {
    response
      .status(error.statusCode as number)
      .json({ message: error.message, errors: error.errors });
    return;
  }

  logger.error({
    message: 'Unhandled error',
    error: error.message,
    stack: error.stack,
  });

  response.status(500).json({ message: 'Internal server error' });
};
