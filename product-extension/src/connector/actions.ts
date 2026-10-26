/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import type {
  ExtensionDestination,
  ExtensionTrigger,
  ExtensionUpdateAction,
} from '@commercetools/platform-sdk';
import { Config } from '../interfaces/config.interface';

export const EXTENSION_KEY = 'auto-categorization-product-extension';

/** Must match the `endpoint` this application declares in connect.yaml. */
const ENDPOINT = '/product-extension';

/**
 * Every product create and every product update, with no condition.
 *
 * A condition would let commercetools skip the call, but which products a
 * rule cares about is the rule's business and changes whenever a
 * merchandiser saves one — a predicate fixed at deploy time cannot follow
 * it, and a wrong one silently stops assignments happening.
 */
export function buildTriggers(): ExtensionTrigger[] {
  return [{ resourceTypeId: 'product', actions: ['Create', 'Update'] }];
}

export function buildDestination(config: Config): ExtensionDestination {
  if (!config.serviceUrl) {
    throw new Error(
      'CONNECT_SERVICE_URL is not set, so the Extension has no endpoint to register'
    );
  }

  return {
    // The discriminator is AuthorizationHeader. The schema type is named
    // AuthorizationHeaderAuthentication, and sending that name instead is
    // rejected as InvalidJsonInput.
    type: 'HTTP',
    url: extensionUrl(config.serviceUrl),
    authentication: {
      type: 'AuthorizationHeader',
      headerValue: `Bearer ${config.extensionSecret}`,
    },
  };
}

/**
 * CONNECT_SERVICE_URL already ends in the application's endpoint path, so
 * appending it again registers a URL the application answers 404 on — and
 * a 404 from an Extension fails the product write that triggered it. Every
 * product create and update in the Project, until someone notices.
 */
export function extensionUrl(serviceUrl: string): string {
  const base = serviceUrl.replace(/\/+$/, '');
  return base.endsWith(ENDPOINT) ? base : `${base}${ENDPOINT}`;
}

/**
 * Converge on the Extension; never delete and re-create it.
 *
 * An Extension sits synchronously in the path of live operations, so the gap
 * between a delete and a create is a window in which products save without
 * their rules being applied. Updating in place has no such window.
 */
export async function ensureExtension(
  apiRoot: ByProjectKeyRequestBuilder,
  config: Config
): Promise<'created' | 'updated' | 'unchanged'> {
  const destination = buildDestination(config);
  const triggers = buildTriggers();

  const {
    body: { results },
  } = await apiRoot
    .extensions()
    .get({ queryArgs: { where: `key = "${EXTENSION_KEY}"` } })
    .execute();

  if (results.length === 0) {
    await apiRoot
      .extensions()
      .post({
        body: {
          key: EXTENSION_KEY,
          destination,
          triggers,
          timeoutInMs: config.timeoutInMs,
        },
      })
      .execute();
    return 'created';
  }

  const current = results[0];
  const actions: ExtensionUpdateAction[] = [];

  if (JSON.stringify(current.destination) !== JSON.stringify(destination)) {
    actions.push({ action: 'changeDestination', destination });
  }
  if (JSON.stringify(current.triggers) !== JSON.stringify(triggers)) {
    // changeTriggers, not setTriggers — the latter is rejected outright.
    actions.push({ action: 'changeTriggers', triggers });
  }
  if (current.timeoutInMs !== config.timeoutInMs) {
    // setTimeoutInMs, not changeTimeoutInMs.
    actions.push({ action: 'setTimeoutInMs', timeoutInMs: config.timeoutInMs });
  }

  if (actions.length === 0) return 'unchanged';

  await apiRoot
    .extensions()
    .withKey({ key: EXTENSION_KEY })
    .post({ body: { version: current.version, actions } })
    .execute();

  return 'updated';
}

export async function deleteExtension(
  apiRoot: ByProjectKeyRequestBuilder
): Promise<boolean> {
  const {
    body: { results },
  } = await apiRoot
    .extensions()
    .get({ queryArgs: { where: `key = "${EXTENSION_KEY}"` } })
    .execute();

  if (results.length === 0) return false;

  await apiRoot
    .extensions()
    .withKey({ key: EXTENSION_KEY })
    .delete({ queryArgs: { version: results[0].version } })
    .execute();

  return true;
}
