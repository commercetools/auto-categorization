/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import CustomError from '../errors/custom.error';
import { Config } from '../interfaces/config.interface';
import envValidators from '../validators/env.validators';
import { getValidateMessages } from '../validators/helpers.validators';

let cached: Config | undefined;

export const readConfiguration = (): Config => {
  if (cached) return cached;

  const envVars = {
    clientId: process.env.CTP_CLIENT_ID,
    clientSecret: process.env.CTP_CLIENT_SECRET,
    projectKey: process.env.CTP_PROJECT_KEY,
    scope: process.env.CTP_SCOPE,
    region: process.env.CTP_REGION,
    pageSize: Number(process.env.SWEEP_PAGE_SIZE ?? 100),
    budgetMinutes: Number(process.env.SWEEP_BUDGET_MINUTES ?? 25),
    fullReconcileMinutes: Number(process.env.FULL_RECONCILE_MINUTES ?? 60),
    lockTtlMinutes: Number(process.env.JOB_LOCK_TTL_MINUTES ?? 35),
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
