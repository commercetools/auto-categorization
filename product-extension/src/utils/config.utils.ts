/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import CustomError from '../errors/custom.error';
import { Config } from '../interfaces/config.interface';
import envValidators from '../validators/env.validators';
import { getValidateMessages } from '../validators/helpers.validators';

/**
 * Configuration is read and validated once, at startup, so a bad deploy
 * fails visibly instead of failing every product write later.
 */
let cached: Config | undefined;

export const readConfiguration = (): Config => {
  if (cached) return cached;

  const envVars = {
    clientId: process.env.CTP_CLIENT_ID,
    clientSecret: process.env.CTP_CLIENT_SECRET,
    projectKey: process.env.CTP_PROJECT_KEY,
    scope: process.env.CTP_SCOPE,
    region: process.env.CTP_REGION,
    extensionSecret: process.env.EXTENSION_AUTH_SECRET,
    ruleCacheSeconds: Number(process.env.RULE_CACHE_SECONDS ?? 10),
    serviceUrl: process.env.CONNECT_SERVICE_URL,
    timeoutInMs: Number(process.env.EXTENSION_TIMEOUT_MS ?? 2000),
  } as Config;

  const validationErrors = getValidateMessages(envValidators, envVars);
  if (validationErrors.length) {
    throw new CustomError(
      'InvalidEnvironmentVariablesError',
      'Invalid environment configuration',
      validationErrors
    );
  }

  cached = envVars;
  return cached;
};

export const resetConfigurationCache = () => {
  cached = undefined;
};
