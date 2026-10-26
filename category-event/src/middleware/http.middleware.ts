/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { type HttpMiddlewareOptions } from '@commercetools/ts-client'; // Required for sending HTTP requests
import { readConfiguration } from '../utils/config.utils';

/**
 * Configure Middleware. Example only. Adapt on your own
 */
export const httpMiddlewareOptions: HttpMiddlewareOptions = {
  host: `https://api.${readConfiguration().region}.commercetools.com`,
};
