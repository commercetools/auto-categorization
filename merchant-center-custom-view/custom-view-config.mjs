/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Auto-categorization, as a panel on the category a merchandiser is
 * already looking at.
 *
 * Every deploy-time value is read from the environment that Connect fills from
 * connect.yaml, with a fallback so the file always evaluates. A `${env:...}`
 * placeholder would throw at build time when its variable is unset.
 *
 * @type {import('@commercetools-frontend/application-config').ConfigOptionsForCustomView}
 */
const config = {
  name: 'Auto-categorization',
  cloudIdentifier: process.env.CLOUD_IDENTIFIER || 'gcp-us',
  env: {
    development: {
      initialProjectKey: 'my-project-key',
      // Render against a category details page locally, which is the only
      // place this panel means anything.
      hostUriPath:
        '/my-project-key/categories/00000000-0000-0000-0000-000000000000/general',
    },
    production: {
      customViewId: process.env.CUSTOM_VIEW_ID || '',
      // appkit rejects an empty URL when it builds. The fallback lets the build
      // validate; on a deployment Connect sets APPLICATION_URL, and the start
      // command's compile-html bakes that real value into the served page.
      url: process.env.APPLICATION_URL || 'https://mc-view-placeholder.example.com',
    },
  },
  additionalEnv: {
    rulesApiUrl: process.env.RULES_API_URL || '',
  },
  // The default group carries no scopes: a Custom View's default
  // permissions are named plainly View and Manage, and a rules API that
  // accepted canManage would accept it from any customization in the
  // Project. A named group gives the same permission keys as the Custom
  // Application — ViewAutoCategorization and ManageAutoCategorization — so
  // one check on the API covers both surfaces exactly.
  oAuthScopes: {
    view: [],
    manage: [],
  },
  additionalOAuthScopes: [
    {
      name: 'auto-categorization',
      view: ['view_products', 'view_categories', 'view_key_value_documents'],
      manage: ['manage_products', 'manage_key_value_documents'],
    },
  ],
  labelAllLocales: [{ locale: 'en', value: 'Auto-categorization' }],
  type: 'CustomPanel',
  typeSettings: {
    size: 'LARGE',
  },
  // The category details page, which is the page the rules belong to.
  locators: ['categories.category_details.general'],
};

export default config;
