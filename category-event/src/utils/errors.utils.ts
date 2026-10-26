/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Telling a failure that will fix itself from one that will not.
 *
 * This is the whole acknowledgement decision. A transient failure must go
 * back on the queue; a permanent one must be acknowledged and logged, or the
 * broker redelivers it for seven days.
 */

function statusOf(error: unknown): number | undefined {
  const candidate = error as { statusCode?: number; status?: number };
  return candidate?.statusCode ?? candidate?.status;
}

export function isNotFoundError(error: unknown): boolean {
  return statusOf(error) === 404;
}

export function isTransientError(error: unknown): boolean {
  const status = statusOf(error);

  // A concurrent modification means someone else wrote the product first.
  // Redelivery re-reads it and recomputes, which is exactly the fix.
  if (status === 409) return true;
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500) return true;

  // No status at all is a socket or DNS failure rather than a rejection.
  return status === undefined;
}
