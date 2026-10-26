/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export interface Config {
  clientId: string;
  clientSecret: string;
  projectKey: string;
  scope?: string;
  region: string;
  /** Shared secret commercetools presents when it calls this endpoint. */
  extensionSecret: string;
  /** How long a rule read is reused, in seconds. */
  ruleCacheSeconds: number;
  /** Public URL of this application, injected by Connect at deploy time. */
  serviceUrl?: string;
  /** Extension response budget in milliseconds. */
  timeoutInMs: number;
}
