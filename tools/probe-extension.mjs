/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/** Asks the deployed Extension a question with a known right answer. */
import { ClientBuilder } from '@commercetools/ts-client';
import { createApiBuilderFromCtpClient } from '@commercetools/platform-sdk';
import { deleteRule, saveRule, toRule } from 'common-connect';

const { CTP_CLIENT_ID, CTP_CLIENT_SECRET, CTP_PROJECT_KEY, CTP_REGION = 'us-central1.gcp',
        EXTENSION_URL, EXTENSION_SECRET } = process.env;

const apiRoot = createApiBuilderFromCtpClient(
  new ClientBuilder().withProjectKey(CTP_PROJECT_KEY)
    .withClientCredentialsFlow({ host: `https://auth.${CTP_REGION}.commercetools.com`,
      projectKey: CTP_PROJECT_KEY,
      credentials: { clientId: CTP_CLIENT_ID, clientSecret: CTP_CLIENT_SECRET } })
    .withHttpMiddleware({ host: `https://api.${CTP_REGION}.commercetools.com` }).build()
).withProjectKey({ projectKey: CTP_PROJECT_KEY });

const category = await apiRoot.categories().withKey({ key: 'new-arrivals' }).get().execute().then(r => r.body);

// A rule that cannot be wrong: match on the product key, exactly.
const rule = toRule({
  key: 'zz-probe-rule', name: 'Probe', categoryId: category.id, enabled: true, match: 'all',
  conditions: [{ field: { kind: 'key', valueKind: 'text' }, operator: 'equals', value: 'zz-probe-product' }],
  removeWhenNoLongerMatching: false,
}, new Date());
await saveRule(apiRoot, rule);
process.stdout.write('probe rule saved\n');

const data = { name: { 'en-US': 'Probe' }, slug: { 'en-US': 'probe' }, categories: [],
  masterVariant: { id: 1, sku: 'PROBE-1' }, variants: [], searchKeywords: {} };
const payload = { action: 'Create', resource: { typeId: 'product', id: 'zz-probe', obj: {
  id: 'zz-probe', version: 1, key: 'zz-probe-product',
  createdAt: new Date().toISOString(), lastModifiedAt: new Date().toISOString(),
  productType: { typeId: 'product-type', id: '3c3027d4-297e-4520-a93c-6ab726ffc5f4' },
  masterData: { published: true, hasStagedChanges: false, current: data, staged: data },
}}};

// Give the extension's rule cache time to expire.
await new Promise((r) => setTimeout(r, 12_000));

const response = await fetch(EXTENSION_URL, {
  method: 'POST',
  headers: { Authorization: `Bearer ${EXTENSION_SECRET}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
const body = await response.text();
process.stdout.write(`extension: ${response.status} ${body}\n`);
process.stdout.write(
  body.includes(category.id)
    ? '\nRULES ARE BEING READ and the engine matched.\n'
    : '\nNo action returned — the rules read or the evaluation is failing inside the extension.\n'
);

await deleteRule(apiRoot, 'zz-probe-rule');
