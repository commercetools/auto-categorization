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
    publicApiUrl:
      process.env.PUBLIC_API_URL ?? process.env.CONNECT_SERVICE_URL ?? '',
    cloudIdentifier: process.env.CLOUD_IDENTIFIER ?? 'gcp-us',
    viewPermission:
      process.env.VIEW_PERMISSION ?? 'canViewAutoCategorization',
    managePermission:
      process.env.MANAGE_PERMISSION ?? 'canManageAutoCategorization',
    pageSize: Number(process.env.SWEEP_PAGE_SIZE ?? 100),
    maxPagesPerRequest: Number(process.env.SWEEP_MAX_PAGES ?? 10),
    requestBudgetSeconds: Number(process.env.SWEEP_BUDGET_SECONDS ?? 20),
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

/** The origin the Merchant Center's session token is addressed to. */
export const audienceOrigin = (config: Config): string =>
  new URL(config.publicApiUrl).origin;
