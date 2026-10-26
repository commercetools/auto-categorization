/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Router } from 'express';

import { post, status } from '../controllers/extension.controller';
import { requireExtensionSecret } from '../middleware/extension-auth.middleware';

const extensionRouter: Router = Router();

// Liveness only. Everything that does work is authenticated.
extensionRouter.get('/status', status);

extensionRouter.post('/', requireExtensionSecret, async (req, res, next) => {
  try {
    await post(req, res);
  } catch (error) {
    next(error);
  }
});

export default extensionRouter;
