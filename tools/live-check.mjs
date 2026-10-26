/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * A live pass over a real Project, using the connector's own shared module.
 *
 * Reads credentials from the environment, writes one rule, previews it,
 * applies it, checks the result, and re-runs to prove a second pass writes
 * nothing. Nothing about it is part of the deployed connector — it exists
 * so the engine can be proved against a real catalog before anything is
 * deployed.
 */
import { ClientBuilder } from '@commercetools/ts-client';
import { createApiBuilderFromCtpClient } from '@commercetools/platform-sdk';
import {
  deleteRule,
  listRules,
  loadEvaluationContext,
  saveRule,
  sweepAll,
  toRule,
  validateRule,
} from 'common-connect';

const {
  CTP_CLIENT_ID,
  CTP_CLIENT_SECRET,
  CTP_PROJECT_KEY,
  CTP_REGION = 'us-central1.gcp',
  TARGET_CATEGORY_KEY,
  RULE_DAYS = '30',
  CLEANUP,
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

const step = (message) => process.stdout.write(`\n== ${message}\n`);

const category = await apiRoot
  .categories()
  .withKey({ key: TARGET_CATEGORY_KEY })
  .get()
  .execute()
  .then((response) => response.body);

step(`Target category: ${category.name['en-US'] ?? category.key} (${category.id})`);

const draft = {
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
};

const issues = validateRule(draft);
if (issues.length) throw new Error(`Rule rejected: ${issues.join('; ')}`);

if (CLEANUP === 'true') {
  step('Cleaning up');
  await deleteRule(apiRoot, draft.key);
  const { body } = await apiRoot
    .productProjections()
    .search()
    .get({
      queryArgs: {
        staged: true,
        limit: 0,
        markMatchingVariants: false,
        'filter.query': `categories.id:"${category.id}"`,
      },
    })
    .execute()
    .catch(() => ({ body: { total: 'unknown' } }));
  process.stdout.write(`Rule removed. Category still holds ${body.total} products; run the sweep to release them.\n`);
  process.exit(0);
}

step('Saving the rule');
const rule = toRule(draft, new Date());
await saveRule(apiRoot, rule);
process.stdout.write(`${(await listRules(apiRoot)).length} rule(s) stored\n`);

const { ctx } = await loadEvaluationContext(apiRoot);
process.stdout.write(
  `Context: ${Object.keys(ctx.productTypeKeyById).length} product types, default currency ${ctx.defaultCurrency}\n`
);

step('Preview (writes nothing)');
const preview = await sweepAll(apiRoot, {
  rules: [rule],
  ctx,
  dryRun: true,
  pageSize: 100,
  maxPages: 50,
});
process.stdout.write(`${JSON.stringify(preview.totals)}  done=${preview.done}\n`);
for (const change of preview.changes.slice(0, 5)) {
  const verb = change.added.length ? 'add' : 'remove';
  process.stdout.write(`  would ${verb} ${change.productKey ?? change.productId}\n`);
}

step('Apply');
const applied = await sweepAll(apiRoot, {
  rules: [rule],
  ctx,
  pageSize: 100,
  maxPages: 50,
});
process.stdout.write(`${JSON.stringify(applied.totals)}  done=${applied.done}\n`);

step('Second pass — should write nothing');
const again = await sweepAll(apiRoot, {
  rules: [rule],
  ctx,
  pageSize: 100,
  maxPages: 50,
});
process.stdout.write(`${JSON.stringify(again.totals)}  done=${again.done}\n`);

step('Reading the category back from the API');
const { body: inCategory } = await apiRoot
  .productProjections()
  .get({
    queryArgs: {
      staged: true,
      limit: 5,
      where: `categories(id="${category.id}")`,
      withTotal: true,
    },
  })
  .execute();
process.stdout.write(`${inCategory.total} products are in the category\n`);
for (const product of inCategory.results) {
  process.stdout.write(
    `  ${product.masterVariant.sku ?? product.id} — ${product.name['en-US']} (created ${product.createdAt})\n`
  );
}

if (again.totals.productsChanged !== 0) {
  process.stderr.write('\nFAIL: the second pass wrote something; the sweep is not idempotent\n');
  process.exit(1);
}
process.stdout.write('\nOK: applied once, idempotent on re-run\n');
