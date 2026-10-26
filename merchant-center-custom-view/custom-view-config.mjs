/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Auto-categorization, as a panel on the category a merchandiser is
 * already looking at.
 *
 * Every deploy-time value is an ${env:...} placeholder that Connect fills
 * from connect.yaml, so the same repository installs into any Project
 * without an edit.
 *
 * @type {import('@commercetools-frontend/application-config').ConfigOptionsForCustomView}
 */
const config = {
  name: 'Auto-categorization',
  cloudIdentifier: '${env:CLOUD_IDENTIFIER}',
  env: {
    development: {
      initialProjectKey: 'my-project-key',
      // Render against a category details page locally, which is the only
      // place this panel means anything.
      hostUriPath: '/my-project-key/categories/00000000-0000-0000-0000-000000000000/general',
    },
    production: {
      customViewId: '${env:CUSTOM_VIEW_ID}',
      url: '${env:APPLICATION_URL}',
    },
  },
  additionalEnv: {
    rulesApiUrl: '${env:RULES_API_URL}',
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
  labelAllLocales: [
    { locale: 'en', value: 'Auto-categorization' },
  ],
  type: 'CustomPanel',
  typeSettings: {
    size: 'LARGE',
  },
  // The category details page, which is the page the rules belong to.
  locators: ['categories.category_details.general'],
};

export default config;
