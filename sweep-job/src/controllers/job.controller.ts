/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { createApiRoot } from '../client/create.client';
import { readConfiguration } from '../utils/config.utils';
import { logger } from '../utils/logger.utils';
import { runSweepJob } from '../handlers/sweep.job';

export const post = async (_request: Request, response: Response) => {
  const runId = randomUUID();

  try {
    const result = await runSweepJob(
      createApiRoot(),
      readConfiguration(),
      runId
    );
    response.status(200).send(result);
  } catch (error) {
    logger.error({
      message: 'Sweep run failed',
      runId,
      error: error instanceof Error ? error.message : String(error),
    });
    // A non-2xx marks the scheduled run as failed, which is what a failure
    // is. Progress is checkpointed, so the next tick resumes rather than
    // starting the catalog over.
    response.status(500).send({ runId, message: 'Sweep run failed' });
  }
};

export const status = (_request: Request, response: Response) => {
  response.status(200).send({ status: 'ok' });
};
