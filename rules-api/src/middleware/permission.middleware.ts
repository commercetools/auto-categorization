/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { NextFunction, Request, Response } from 'express';
import { readConfiguration } from '../utils/config.utils';
import { logger } from '../utils/logger.utils';

/**
 * The session middleware proves the caller is a signed-in Merchant Center
 * user with access to this Project. It does not prove they are allowed to
 * rewrite the catalog's category structure, which is what a rule does — so
 * that is checked here, against the permissions the gateway forwards.
 *
 * The permissions claim only arrives when the caller asks for it with
 * `X-Forward-To-Claims: permissions`. Both Merchant Center surfaces in this
 * connector always do; a caller that does not is refused rather than waved
 * through, because a missing claim is indistinguishable from a caller
 * hoping it is not checked.
 */

export type McSession = {
  userId: string;
  projectKey: string;
  userPermissions?: string[];
};

declare module 'express-serve-static-core' {
  interface Request {
    session?: McSession;
  }
}

export const requirePermission =
  (kind: 'view' | 'manage') =>
  (request: Request, response: Response, next: NextFunction) => {
    const config = readConfiguration();
    const needed =
      kind === 'manage' ? config.managePermission : config.viewPermission;
    const held = request.session?.userPermissions;

    if (!held) {
      logger.warn({
        message:
          'Refused a request that carried no permissions claim; send X-Forward-To-Claims: permissions',
        userId: request.session?.userId,
      });
      response.status(403).send({ message: 'Forbidden' });
      return;
    }

    // A user who may manage rules may obviously also read them.
    const allowed =
      held.includes(needed) ||
      (kind === 'view' && held.includes(config.managePermission));

    if (!allowed) {
      logger.warn({
        message: 'Refused a request for lacking a permission',
        userId: request.session?.userId,
        needed,
      });
      response.status(403).send({ message: 'Forbidden' });
      return;
    }

    next();
  };
