/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * A transitive dependency ships `@types/json-stable-stringify` as a
 * deprecated stub with no declaration file, which tsc reports as a missing
 * type library because `typeRoots` pulls in every package under
 * `node_modules/@types`. This shadows the stub; the real types come from
 * `json-stable-stringify` itself.
 */
declare module 'json-stable-stringify';
