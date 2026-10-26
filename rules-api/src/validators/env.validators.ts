/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  optional,
  region,
  standardKey,
  standardString,
  standardUrl,
} from './helpers.validators';

const envValidators = [
  standardString(
    ['clientId'],
    {
      code: 'InvalidClientId',
      message: 'CTP_CLIENT_ID should be 24 characters.',
      referencedBy: 'environmentVariables',
    },
    { min: 24, max: 24 }
  ),

  standardString(
    ['clientSecret'],
    {
      code: 'InvalidClientSecret',
      message: 'CTP_CLIENT_SECRET should be 32 characters.',
      referencedBy: 'environmentVariables',
    },
    { min: 32, max: 32 }
  ),

  standardKey(['projectKey'], {
    code: 'InvalidProjectKey',
    message: 'CTP_PROJECT_KEY should be a valid Project key.',
    referencedBy: 'environmentVariables',
  }),

  optional(standardString)(
    ['scope'],
    {
      code: 'InvalidScope',
      message: 'CTP_SCOPE should be at least 2 characters long.',
      referencedBy: 'environmentVariables',
    },
    { min: 2, max: undefined }
  ),

  region(['region'], {
    code: 'InvalidRegion',
    message: 'CTP_REGION is not a valid commercetools region.',
    referencedBy: 'environmentVariables',
  }),

  standardUrl(['publicApiUrl'], {
    code: 'InvalidPublicApiUrl',
    message:
      'PUBLIC_API_URL (or the Connect-injected CONNECT_SERVICE_URL) must be the https origin the Merchant Center reaches this API at.',
    referencedBy: 'environmentVariables',
  }),

  standardString(
    ['cloudIdentifier'],
    {
      code: 'InvalidCloudIdentifier',
      message:
        'CLOUD_IDENTIFIER must name the Merchant Center API region, for example gcp-us.',
      referencedBy: 'environmentVariables',
    },
    { min: 4, max: 20 }
  ),
];

export default envValidators;
