/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Router } from 'express';

import * as rules from '../controllers/rules.controller';
import { requirePermission } from '../middleware/permission.middleware';

const rulesRouter: Router = Router();

const wrap =
  (handler: (typeof rules)['list']) =>
  async (req: Parameters<typeof handler>[0], res: Parameters<typeof handler>[1], next: (e?: unknown) => void) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };

const canView = requirePermission('view');
const canManage = requirePermission('manage');

rulesRouter.get('/meta', canView, wrap(rules.meta));

rulesRouter.get('/rules', canView, wrap(rules.list));
rulesRouter.get('/rules/:key', canView, wrap(rules.read));
rulesRouter.put('/rules/:key', canManage, wrap(rules.upsert));
// The Merchant Center gateway's forwardTo helpers cover GET, POST, HEAD and
// DELETE but not PUT, so an upsert is reachable by either verb.
rulesRouter.post('/rules/:key', canManage, wrap(rules.upsert));
rulesRouter.delete('/rules/:key', canManage, wrap(rules.remove));

// A dry run reads the catalog and writes nothing, but it is still a full
// catalog pass someone has to pay for, so it needs the manage permission
// like any other run.
rulesRouter.post('/rules/:key/run', canManage, wrap(rules.runRule));
rulesRouter.post('/categories/:id/run', canManage, wrap(rules.runCategory));
rulesRouter.post('/run', canManage, wrap(rules.runAll));

rulesRouter.get('/runs/:scope/:target', canView, wrap(rules.lastRun));

export default rulesRouter;
