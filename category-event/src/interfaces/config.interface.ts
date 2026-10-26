/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export interface Config {
  clientId: string;
  clientSecret: string;
  projectKey: string;
  scope: string;
  region: string;
  port: string;
  connectSubscriptionDestination?: string;
  connectGcpTopicName?: string;
  connectGcpProjectId?: string;
  connectAwsTopicArn?: string;
}
