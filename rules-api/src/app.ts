/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import express, { ErrorRequestHandler, Express } from 'express';
import bodyParser from 'body-parser';
import { createSessionMiddleware } from '@commercetools-backend/express';

import RulesRoutes from './routes/rules.route';
import { status } from './controllers/rules.controller';

import { audienceOrigin, readConfiguration } from './utils/config.utils';
import { errorMiddleware } from './middleware/error.middleware';
import CustomError from './errors/custom.error';
import { logger } from './utils/logger.utils';

const config = readConfiguration();

const app: Express = express();
app.disable('x-powered-by');
app.use(bodyParser.json({ limit: '1mb' }));

// Liveness, before anything that authenticates.
app.get('/rules-api/status', status);

/**
 * Every other route is a Merchant Center user acting on their own session.
 *
 * The browser never reaches this API directly: it calls the Merchant Center
 * API Gateway's /proxy/forward-to, which checks the user has access to the
 * Project and then forwards the request with a signed token addressed to
 * this origin. Verifying that token is what turns "somebody posted to a
 * public URL" into "a named user with a named permission".
 */
app.use(
  '/rules-api',
  createSessionMiddleware({
    audience: audienceOrigin(config),
    // A cloud identifier (gcp-us, aws-eu, ...) or a Merchant Center API
    // Gateway URL; both are accepted and the identifier is what an
    // installer knows.
    issuer: config.cloudIdentifier,
  })
);
/**
 * A rejected session is a 401, and saying so matters.
 *
 * Registered between the session middleware and the routes, so it sees
 * only what the session middleware threw. The generic handler at the
 * bottom answers 500 for anything it does not recognise, and a 500 here
 * costs the caller its one useful reaction: the Merchant Center SDK
 * renews its token and retries once on a 401, and a Merchant Center
 * application can tell the user it is not signed in. Neither happens for
 * a 500, which reads as "the API is broken" for what is usually an
 * expired token or an audience mismatch.
 */
const sessionErrorMiddleware: ErrorRequestHandler = (
  error,
  _request,
  response,
  next
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  logger.info({
    message: 'Rejected a request with no valid Merchant Center session',
    reason: error instanceof Error ? error.message : String(error),
  });

  response.status(401).json({
    message:
      'No valid Merchant Center session. This API is reached through the Merchant Center API Gateway /proxy/forward-to.',
  });
};
app.use('/rules-api', sessionErrorMiddleware);

app.use('/rules-api', RulesRoutes);

app.use('*', () => {
  throw new CustomError(404, 'Path not found.');
});

app.use(errorMiddleware);

export default app;
