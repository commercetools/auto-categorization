/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Router } from 'express';

import { post, status } from '../controllers/event.controller';

const eventRouter: Router = Router();

// Liveness only — no secrets, no work, and the one route the broker never
// calls.
eventRouter.get('/status', status);

eventRouter.post('/', async (req, res, next) => {
  try {
    await post(req, res);
  } catch (error) {
    next(error);
  }
});

export default eventRouter;
