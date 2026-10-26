/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { extensionUrl } from '../src/connector/actions';

/**
 * The URL this Extension is registered at is the single highest-stakes
 * string in the connector. A 404 from an Extension does not degrade the
 * feature — it fails the product write that triggered it, for every
 * client, until someone notices.
 */
describe('extensionUrl', () => {
  const ENDPOINT = '/product-extension';
  const host = 'https://service-abc.us-central1.gcp.preview.commercetools.app';

  it('does not append the endpoint that Connect already included', () => {
    expect(extensionUrl(`${host}${ENDPOINT}`)).toBe(`${host}${ENDPOINT}`);
  });

  it('appends it when the injected URL is a bare origin', () => {
    expect(extensionUrl(host)).toBe(`${host}${ENDPOINT}`);
  });

  it('tolerates a trailing slash either way', () => {
    expect(extensionUrl(`${host}/`)).toBe(`${host}${ENDPOINT}`);
    expect(extensionUrl(`${host}${ENDPOINT}/`)).toBe(`${host}${ENDPOINT}`);
  });

  it('never produces the doubled path', () => {
    for (const input of [host, `${host}/`, `${host}${ENDPOINT}`, `${host}${ENDPOINT}/`]) {
      expect(extensionUrl(input)).not.toContain(`${ENDPOINT}${ENDPOINT}`);
    }
  });
});
