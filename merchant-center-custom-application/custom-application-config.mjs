/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * No imports, deliberately. This file is evaluated by Node in the Connect
 * container, where importing a source module (./src/constants) is a bet on that
 * runtime's module resolution. The browser bundle derives the same values from
 * src/constants.ts, so keep the two in step.
 */
const entryPointUriPath =
  process.env.ENTRY_POINT_URI_PATH || 'auto-categorization';

// `acme-auto-categorization` -> ViewAcmeAutoCategorization. A numeric segment is
// rendered as `/N`, as appkit's entryPointUriPathToPermissionKeys does.
const pascalCase = entryPointUriPath
  .split('-')
  .map((part) =>
    /^\d+$/.test(part)
      ? `/${part}`
      : part.charAt(0).toUpperCase() + part.slice(1)
  )
  .join('');

const PERMISSIONS = {
  View: `View${pascalCase}`,
  Manage: `Manage${pascalCase}`,
};

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
