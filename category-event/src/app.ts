/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import express, { Express } from 'express';

// Import routes
import EventRoutes from './routes/event.route';

import { readConfiguration } from './utils/config.utils';
import { errorMiddleware } from './middleware/error.middleware';
import CustomError from './errors/custom.error';

// Read env variables
readConfiguration();

// Create the express app
const app: Express = express();
app.disable('x-powered-by');

// Define configurations
app.use(express.json({ limit: '5mb' }));

// Define routes
app.use('/category-event', EventRoutes);
// A terminal middleware rather than a '*' route: Express 5 parses route
// paths with path-to-regexp 8, which rejects a bare asterisk.
app.use(() => {
  throw new CustomError(404, 'Path not found.');
});

// Global error handler
app.use(errorMiddleware);

export default app;
