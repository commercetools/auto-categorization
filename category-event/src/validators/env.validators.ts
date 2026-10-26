/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  optional,
  standardString,
  standardKey,
  region,
} from './helpers.validators';

/**
 * Create here your own validators
 */
const envValidators = [
  standardString(
    ['clientId'],
    {
      code: 'InValidClientId',
      message: 'Client id should be 24 characters.',
      referencedBy: 'environmentVariables',
    },
    { min: 24, max: 24 }
  ),

  standardString(
    ['clientSecret'],
    {
      code: 'InvalidClientSecret',
      message: 'Client secret should be 32 characters.',
      referencedBy: 'environmentVariables',
    },
    { min: 32, max: 32 }
  ),

  standardKey(['projectKey'], {
    code: 'InvalidProjectKey',
    message: 'Project key should be a valid string.',
    referencedBy: 'environmentVariables',
  }),

  standardString(
    ['scope'],
    {
      code: 'InvalidScope',
      message: 'Scope should be at least 2 characters long.',
      referencedBy: 'environmentVariables',
    },
    { min: 2, max: undefined }
  ),

  region(['region'], {
    code: 'InvalidRegion',
    message: 'Not a valid region.',
    referencedBy: 'environmentVariables',
  }),

  // Optional, not required: the platform sets PORT in the running
  // container but not in the one that runs post-deploy, and a required
  // check there throws before the Subscription is ever registered — a
  // deployment that reports success while nothing is listening.
  optional(standardString)(
    ['port'],
    {
      code: 'InvalidPort',
      message: 'PORT should be a valid string.',
      referencedBy: 'environmentVariables',
    },
    { min: 1, max: undefined }
  ),

  optional(standardString)(
    ['connectSubscriptionDestination'],
    {
      code: 'InvalidSubscriptionDestination',
      message: 'Subscription destination should be a valid string.',
      referencedBy: 'environmentVariables',
    },
    { min: 2, max: undefined }
  ),

  optional(standardString)(
    ['connectGcpTopicName'],
    {
      code: 'InvalidGcpTopicName',
      message: 'GCP Topic Name should be a valid string.',
      referencedBy: 'environmentVariables',
    },
    { min: 2, max: undefined }
  ),

  optional(standardString)(
    ['connectGcpProjectId'],
    {
      code: 'InvalidGcpProjectId',
      message: 'GCP Project ID should be a valid string.',
      referencedBy: 'environmentVariables',
    },
    { min: 2, max: undefined }
  ),

  optional(standardString)(
    ['connectAwsTopicArn'],
    {
      code: 'InvalidAwsTopicArn',
      message: 'AWS Topic ARN should be a valid string.',
      referencedBy: 'environmentVariables',
    },
    { min: 2, max: undefined }
  ),
];

export default envValidators;
