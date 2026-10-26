/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { logger } from './utils/logger.utils';
import app from './app';

const PORT = Number(process.env.PORT ?? 8080);

const server = app.listen(PORT, () => {
  logger.info(`Product extension listening on port ${PORT}`);
});

export default server;
