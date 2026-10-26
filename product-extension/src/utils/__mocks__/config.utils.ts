/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export const readConfiguration = jest.fn(() => ({
  clientId: 'mockedClientId',
  clientSecret: 'mockedClientSecret',
  projectKey: 'mockedProjectKey',
  scope: 'mockedScope',
  region: 'mockedRegion',
}));
