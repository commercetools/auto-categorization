/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Make sure to import the helper functions from the `ssr` entry point.
import { entryPointUriPathToPermissionKeys } from '@commercetools-frontend/application-shell/ssr';

export const entryPointUriPath =
  typeof window === 'undefined'
    ? (process.env.ENTRY_POINT_URI_PATH as string)
    : ((window as unknown as { app: { entryPointUriPath: string } }).app
        .entryPointUriPath as string);

export const PERMISSIONS = entryPointUriPathToPermissionKeys(
  entryPointUriPath ?? 'auto-categorization'
);
