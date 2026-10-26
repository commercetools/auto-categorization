/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import express, { Express } from 'express';

import ExtensionRoutes from './routes/extension.route';

import { readConfiguration } from './utils/config.utils';
import { errorMiddleware } from './middleware/error.middleware';
import CustomError from './errors/custom.error';

// Fail the container at startup rather than the first product write.
readConfiguration();

const app: Express = express();
app.disable('x-powered-by');

// A product payload carries every variant, so the default 100 KB limit is
// not enough for a large catalog's products.
app.use(express.json({ limit: '5mb' }));

app.use('/product-extension', ExtensionRoutes);
// A terminal middleware rather than a '*' route: Express 5 parses route
// paths with path-to-regexp 8, which rejects a bare asterisk.
app.use(() => {
  throw new CustomError(404, 'Path not found.');
});

app.use(errorMiddleware);

export default app;
