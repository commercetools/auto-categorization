/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Dry-runs several rule shapes against a real catalog and reports how many
 * products each one would claim. Nothing is written.
 */
import { ClientBuilder } from '@commercetools/ts-client';
import { createApiBuilderFromCtpClient } from '@commercetools/platform-sdk';
import { loadEvaluationContext, sweepAll, validateRule } from 'common-connect';

const {
  CTP_CLIENT_ID,
  CTP_CLIENT_SECRET,
  CTP_PROJECT_KEY,
  CTP_REGION = 'us-central1.gcp',
  TARGET_CATEGORY_ID = '00000000-0000-0000-0000-000000000000',
} = process.env;

const apiRoot = createApiBuilderFromCtpClient(
  new ClientBuilder()
    .withProjectKey(CTP_PROJECT_KEY)
    .withClientCredentialsFlow({
      host: `https://auth.${CTP_REGION}.commercetools.com`,
      projectKey: CTP_PROJECT_KEY,
      credentials: { clientId: CTP_CLIENT_ID, clientSecret: CTP_CLIENT_SECRET },
    })
    .withHttpMiddleware({ host: `https://api.${CTP_REGION}.commercetools.com` })
    .build()
).withProjectKey({ projectKey: CTP_PROJECT_KEY });

const base = {
  categoryId: TARGET_CATEGORY_ID,
  enabled: true,
  match: 'all',
  removeWhenNoLongerMatching: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const shapes = [
  ['title starts with "Purina"', [{ field: { kind: 'name', valueKind: 'text' }, operator: 'startsWith', value: 'Purina' }]],
  ['title contains "feed"', [{ field: { kind: 'name', valueKind: 'text' }, operator: 'contains', value: 'feed' }]],
  ['SKU starts with "9"', [{ field: { kind: 'sku', valueKind: 'text' }, operator: 'startsWith', value: '9' }]],
  ['price over $200', [{ field: { kind: 'price', valueKind: 'number' }, operator: 'greaterThan', value: 200 }]],
  ['price under $10', [{ field: { kind: 'price', valueKind: 'number' }, operator: 'lessThan', value: 10 }]],
  ['brand is "Purina"', [{ field: { kind: 'attribute', attributeName: 'brand', valueKind: 'text' }, operator: 'equals', value: 'Purina' }]],
  ['BOPIS eligible', [{ field: { kind: 'attribute', attributeName: 'bopis-eligible', valueKind: 'boolean' }, operator: 'isTrue' }]],
  ['special order', [{ field: { kind: 'attribute', attributeName: 'special-order', valueKind: 'boolean' }, operator: 'isTrue' }]],
  ['review rating at least 4.5', [{ field: { kind: 'attribute', attributeName: 'review-rating', valueKind: 'number' }, operator: 'greaterOrEqual', value: 4.5 }]],
  ['product type is sample-large-goods', [{ field: { kind: 'productType', valueKind: 'text' }, operator: 'equals', value: 'sample-large-goods' }]],
  ['created in the last 7 days', [{ field: { kind: 'createdAt', valueKind: 'date' }, operator: 'withinLastDays', value: 7 }]],
  ['created in the last 60 days', [{ field: { kind: 'createdAt', valueKind: 'date' }, operator: 'withinLastDays', value: 60 }]],
  ['name matches ^\\d+" x \\d+"', [{ field: { kind: 'name', valueKind: 'text' }, operator: 'matchesRegex', value: '^\\d+" x \\d+"' }]],
  ['dog products (animal set contains dog)', [{ field: { kind: 'attribute', attributeName: 'animal', valueKind: 'text' }, operator: 'equals', value: 'Dog' }]],
  ['no video, and over $500', [
    { field: { kind: 'attribute', attributeName: 'video-url', valueKind: 'text' }, operator: 'isEmpty' },
    { field: { kind: 'price', valueKind: 'number' }, operator: 'greaterThan', value: 500 },
  ]],
];

const { ctx } = await loadEvaluationContext(apiRoot);

process.stdout.write(
  `${'Rule'.padEnd(46)} ${'matches'.padStart(8)}\n${'-'.repeat(56)}\n`
);

for (const [label, conditions] of shapes) {
  const rule = { ...base, key: 'probe', name: label, conditions };
  const issues = validateRule(rule);
  if (issues.length) {
    process.stdout.write(`${label.padEnd(46)} ${'INVALID'.padStart(8)}  ${issues.join('; ')}\n`);
    continue;
  }
  const result = await sweepAll(apiRoot, {
    rules: [rule],
    ctx,
    dryRun: true,
    pageSize: 100,
    maxPages: 50,
  });
  process.stdout.write(
    `${label.padEnd(46)} ${String(result.totals.productsChanged).padStart(8)}\n`
  );
}
