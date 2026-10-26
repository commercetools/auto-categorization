/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Router } from 'express';

import { post, status } from '../controllers/job.controller';

const jobRouter: Router = Router();

jobRouter.get('/status', status);

jobRouter.post('/', async (req, res, next) => {
  try {
    await post(req, res);
  } catch (error) {
    next(error);
  }
});

export default jobRouter;
