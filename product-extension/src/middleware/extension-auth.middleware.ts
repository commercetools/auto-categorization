/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { readConfiguration } from '../utils/config.utils';
import { logger } from '../utils/logger.utils';

/**
 * The endpoint is on the public internet and it rewrites products, so it is
 * only ever called by commercetools carrying the shared secret the
 * Extension was registered with. Registering the secret is not on its own
 * enough — the destination tells commercetools what to send, and this is
 * what checks that it arrived.
 */
export const requireExtensionSecret = (
  request: Request,
  response: Response,
  next: NextFunction
) => {
  const expected = readConfiguration().extensionSecret;
  const presented = request.header('authorization');

  if (!presented || !safeEquals(presented, `Bearer ${expected}`)) {
    logger.warn({
      message: 'Rejected an unauthenticated call to the Product extension',
      correlationId: request.header('x-correlation-id'),
    });
    response.status(401).send({ message: 'Unauthorized' });
    return;
  }

  next();
};

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
