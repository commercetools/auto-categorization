/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Proves a deployment is real, against the Project it was deployed into.
 *
 * Reaching "Deployed" is not a verification: a post-deploy script that
 * fails does not reliably fail the deployment, and an Extension that
 * never registered leaves a connector that looks healthy and does
 * nothing. So this reads the registrations back, then creates a product
 * and checks the category arrived in the same write.
 */
import { ClientBuilder } from '@commercetools/ts-client';
import { createApiBuilderFromCtpClient } from '@commercetools/platform-sdk';
import { listRules, loadEvaluationContext, saveRule, toRule } from 'common-connect';

const {
  CTP_CLIENT_ID,
  CTP_CLIENT_SECRET,
  CTP_PROJECT_KEY,
  CTP_REGION = 'us-central1.gcp',
  TARGET_CATEGORY_KEY = 'new-arrivals',
  RULE_DAYS = '7',
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

const failures = [];
const check = (ok, label, detail = '') => {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!ok) failures.push(label);
};

process.stdout.write('\n== Registrations\n');

const { body: extensions } = await apiRoot
  .extensions()
  .get({ queryArgs: { where: 'key = "auto-categorization-product-extension"' } })
  .execute();

const extension = extensions.results[0];
check(Boolean(extension), 'Product API Extension registered');
if (extension) {
  check(
    extension.destination.type === 'HTTP' &&
      extension.destination.url.includes('/product-extension'),
    'Extension points at the deployed endpoint',
    extension.destination.type === 'HTTP' ? extension.destination.url : ''
  );
  check(
    extension.destination.type === 'HTTP' &&
      extension.destination.authentication?.type === 'AuthorizationHeader',
    'Extension carries an authorization header'
  );
  check(
    extension.triggers.some(
      (t) =>
        t.resourceTypeId === 'product' &&
        t.actions?.includes('Create') &&
        t.actions?.includes('Update')
    ),
    'Extension triggers on product create and update'
  );
}

const { body: subscriptions } = await apiRoot
  .subscriptions()
  .get({ queryArgs: { where: 'key = "auto-categorization-category-changes"' } })
  .execute();

const subscription = subscriptions.results[0];
check(Boolean(subscription), 'Category Change Subscription registered');
if (subscription) {
  check(subscription.status === 'Healthy', 'Subscription is healthy', subscription.status);
  check(
    subscription.changes?.some((c) => c.resourceTypeId === 'category'),
    'Subscription listens to categories'
  );
}

process.stdout.write('\n== The rule\n');

const category = await apiRoot
  .categories()
  .withKey({ key: TARGET_CATEGORY_KEY })
  .get()
  .execute()
  .then((r) => r.body);

const rules = await listRules(apiRoot);
let rule = rules.find((r) => r.key === 'new-products');
if (!rule) {
  const { ctx } = await loadEvaluationContext(apiRoot);
  void ctx;
  rule = toRule(
    {
      key: 'new-products',
      name: 'New products',
      categoryId: category.id,
      enabled: true,
      match: 'all',
      conditions: [
        {
          field: { kind: 'createdAt', valueKind: 'date' },
          operator: 'withinLastDays',
          value: Number(RULE_DAYS),
        },
      ],
      removeWhenNoLongerMatching: true,
    },
    new Date()
  );
  await saveRule(apiRoot, rule);
}
check(Boolean(rule), `Rule "new-products" stored, filling ${TARGET_CATEGORY_KEY}`);

process.stdout.write('\n== The synchronous path\n');

const productType = await apiRoot
  .productTypes()
  .withKey({ key: 'sample-general' })
  .get()
  .execute()
  .then((r) => r.body);

const stamp = process.env.RUN_STAMP ?? String(Date.now());
const key = `autocat-verify-${stamp}`;

const { body: created } = await apiRoot
  .products()
  .post({
    body: {
      key,
      productType: { typeId: 'product-type', id: productType.id },
      name: { 'en-US': `Auto-categorization check ${stamp}` },
      slug: { 'en-US': key },
      masterVariant: { sku: `AUTOCAT-${stamp}` },
      publish: true,
    },
  })
  .execute();

const assigned = created.masterData.staged.categories.map((c) => c.id);
check(
  assigned.includes(category.id),
  'A brand-new product lands in the category in the same write',
  `version ${created.version}, categories ${JSON.stringify(assigned)}`
);
// commercetools applies an Extension's actions as part of the same
// request, so the version lands at 1 + however many it returned. What
// this pins is that nothing made a SECOND request.
check(
  created.version === 1 + assigned.length,
  'No second request — the version is the create plus its own actions',
  `version ${created.version}, ${assigned.length} categories assigned`
);

// Leave the Project as it was found.
await apiRoot
  .products()
  .withKey({ key })
  .post({ body: { version: created.version, actions: [{ action: 'unpublish' }] } })
  .execute()
  .then((r) =>
    apiRoot
      .products()
      .withKey({ key })
      .delete({ queryArgs: { version: r.body.version } })
      .execute()
  )
  .catch(() => undefined);

process.stdout.write(
  failures.length
    ? `\n${failures.length} check(s) failed: ${failures.join('; ')}\n`
    : '\nEverything checked passed.\n'
);
process.exit(failures.length ? 1 : 0);
