/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { PERMISSIONS, entryPointUriPath } from './src/constants';

/**
 * The rule builder, as a place of its own in the Merchant Center.
 *
 * Every deploy-time value is an ${env:...} placeholder that Connect fills
 * from connect.yaml, so the same repository installs into any Project
 * without an edit.
 *
 * @type {import('@commercetools-frontend/application-config').ConfigOptionsForCustomApplication}
 */
const config = {
  name: 'Auto-categorization',
  entryPointUriPath,
  cloudIdentifier: '${env:CLOUD_IDENTIFIER}',
  env: {
    development: {
      initialProjectKey: 'my-project-key',
    },
    production: {
      applicationId: '${env:CUSTOM_APPLICATION_ID}',
      url: '${env:APPLICATION_URL}',
    },
  },
  additionalEnv: {
    rulesApiUrl: '${env:RULES_API_URL}',
  },
  // A rule reads products and product types to decide, and writes category
  // membership. It reads categories to name a rule's target. Nothing here
  // asks for more than the screens use.
  oAuthScopes: {
    view: ['view_products', 'view_categories', 'view_key_value_documents'],
    manage: ['manage_products', 'manage_key_value_documents'],
  },
  icon: '${path:@commercetools-frontend/assets/application-icons/stack.svg}',
  mainMenuLink: {
    defaultLabel: 'Auto-categorization',
    labelAllLocales: [],
    permissions: [PERMISSIONS.View],
  },
};

export default config;
