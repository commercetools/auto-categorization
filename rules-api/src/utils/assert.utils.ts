/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertError(
  value: unknown,
  message?: string
): asserts value is Error {
  assert(value instanceof Error, message ?? 'Invalid error value');
}

export function assertString(
  value: unknown,
  message?: string
): asserts value is string {
  assert(typeof value === 'string', message ?? 'Invalid string value');
}
