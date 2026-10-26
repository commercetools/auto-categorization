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
  /** Products read per page during a catalog pass. */
  pageSize: number;
  /**
   * Minutes to stop after. The application itself is killed at 30, so this
   * leaves room to checkpoint and hand the rest to the next tick.
   */
  budgetMinutes: number;
  /**
   * How often to reconcile the whole catalog even with nothing queued. This
   * is the backstop for a rule written straight through the API, where
   * nothing signalled the change. Zero switches it off.
   */
  fullReconcileMinutes: number;
  /** Lease length on the run lock. Longer than the 30-minute timeout. */
  lockTtlMinutes: number;
}
