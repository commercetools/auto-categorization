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
  /**
   * Origin of this API as the Merchant Center sees it. The forwarded session
   * token is minted for that audience, so a mismatch rejects every request.
   * Connect injects CONNECT_SERVICE_URL; PUBLIC_API_URL overrides it when
   * the API is reached some other way, such as a tunnel in local
   * development.
   */
  publicApiUrl: string;
  /** Merchant Center API region, e.g. gcp-us. Issuer of the session token. */
  cloudIdentifier: string;
  /** Permission a Merchant Center user needs to read rules. */
  viewPermission: string;
  /** Permission a Merchant Center user needs to write a rule or start a run. */
  managePermission: string;
  /** Products read per page during a catalog pass. */
  pageSize: number;
  /** Pages one Process now request walks before handing back a cursor. */
  maxPagesPerRequest: number;
  /** Seconds one Process now request spends before handing back a cursor. */
  requestBudgetSeconds: number;
}
