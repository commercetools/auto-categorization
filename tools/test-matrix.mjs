/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Drives a variety of categories and rule shapes against a real Project,
 * end to end: create the category, write the rule, run it, and check the
 * membership the API reports back.
 *
 * Then the two things a catalog pass cannot tell you — that a brand-new
 * product is categorized inside its own write, and that a product which
 * stops qualifying is let go.
 */
import { ClientBuilder } from '@commercetools/ts-client';
import { createApiBuilderFromCtpClient } from '@commercetools/platform-sdk';
import {
  deleteRule,
  loadEvaluationContext,
  saveRule,
  sweepAll,
  toRule,
} from 'common-connect';

const {
  CTP_CLIENT_ID,
  CTP_CLIENT_SECRET,
  CTP_PROJECT_KEY,
  CTP_REGION = 'us-central1.gcp',
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

/** Category key, display name, and the rule that fills it. */
const CASES = [
  {
    key: 'auto-new-arrivals',
    name: 'New Arrivals',
    description: 'Everything added to the catalog in the last 30 days.',
    ruleName: 'Added in the last 30 days',
    conditions: [
      { field: { kind: 'createdAt', valueKind: 'date' }, operator: 'withinLastDays', value: 30 },
    ],
  },
  {
    key: 'auto-clearance',
    name: 'Under $10',
    description: 'Everything under ten dollars.',
    ruleName: 'Price under $10',
    conditions: [
      { field: { kind: 'price', valueKind: 'number' }, operator: 'lessThan', value: 10 },
    ],
  },
  {
    key: 'auto-premium',
    name: 'Big Ticket',
    description: 'Everything over two hundred dollars.',
    ruleName: 'Price over $200',
    conditions: [
      { field: { kind: 'price', valueKind: 'number' }, operator: 'greaterThan', value: 200 },
    ],
  },
  {
    key: 'auto-ramps',
    name: 'Ramps & Loading',
    description: 'Anything with ramp in the name.',
    ruleName: 'Name contains "ramp"',
    conditions: [
      { field: { kind: 'name', valueKind: 'text' }, operator: 'contains', value: 'ramp' },
    ],
  },
  {
    key: 'auto-heavy-goods',
    name: 'Large & Heavy',
    description: 'Everything on the large-goods product type.',
    ruleName: 'Product type is large goods',
    conditions: [
      { field: { kind: 'productType', valueKind: 'text' }, operator: 'equals', value: 'sample-large-goods' },
    ],
  },
  {
    key: 'auto-feed-value',
    name: 'Feed under $25',
    description: 'Feed, at an everyday price. Two conditions, both must hold.',
    ruleName: 'Name contains "feed" and price under $25',
    match: 'all',
    conditions: [
      { field: { kind: 'name', valueKind: 'text' }, operator: 'contains', value: 'feed' },
      { field: { kind: 'price', valueKind: 'number' }, operator: 'lessThan', value: 25 },
    ],
  },
];

const failures = [];
const check = (ok, label, detail = '') => {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!ok) failures.push(label);
};

async function ensureCategory({ key, name, description }) {
  try {
    const { body } = await apiRoot.categories().withKey({ key }).get().execute();
    return body;
  } catch {
    const { body } = await apiRoot
      .categories()
      .post({
        body: {
          key,
          name: { 'en-US': name, 'de-DE': name },
          slug: { 'en-US': key, 'de-DE': key },
          description: { 'en-US': description },
          orderHint: '0.5',
        },
      })
      .execute();
    return body;
  }
}

async function countIn(categoryId) {
  const { body } = await apiRoot
    .productProjections()
    .get({
      queryArgs: {
        staged: true,
        limit: 3,
        withTotal: true,
        where: `categories(id="${categoryId}")`,
      },
    })
    .execute();
  return { total: body.total ?? 0, sample: body.results };
}

if (CLEANUP === 'true') {
  process.stdout.write('\n== Cleaning up\n');
  for (const testCase of CASES) {
    await deleteRule(apiRoot, testCase.key).catch(() => undefined);
  }
  const { ctx } = await loadEvaluationContext(apiRoot);
  // With every rule gone, a sweep over the remaining rules releases the
  // products the deleted ones were holding — but only rules that still
  // exist can release anything, so the categories are emptied by hand.
  for (const testCase of CASES) {
    const category = await apiRoot
      .categories()
      .withKey({ key: testCase.key })
      .get()
      .execute()
      .then((r) => r.body)
      .catch(() => undefined);
    if (!category) continue;
    const releaser = toRule(
      {
        key: `${testCase.key}-release`,
        name: 'release',
        categoryId: category.id,
        enabled: true,
        match: 'all',
        conditions: [
          { field: { kind: 'key', valueKind: 'text' }, operator: 'equals', value: '__never__' },
        ],
        removeWhenNoLongerMatching: true,
      },
      new Date()
    );
    const result = await sweepAll(apiRoot, { rules: [releaser], ctx, pageSize: 100, maxPages: 50 });
    process.stdout.write(`  ${testCase.key}: released ${result.totals.removed}\n`);
  }
  process.exit(0);
}

const { ctx } = await loadEvaluationContext(apiRoot);
process.stdout.write(
  `Context: ${Object.keys(ctx.productTypeKeyById).length} product types, currency ${ctx.defaultCurrency ?? '(unreadable)'}\n`
);

process.stdout.write('\n== A category and a rule for each shape\n');

const built = [];

for (const testCase of CASES) {
  const category = await ensureCategory(testCase);
  const rule = toRule(
    {
      key: testCase.key,
      name: testCase.ruleName,
      categoryId: category.id,
      enabled: true,
      match: testCase.match ?? 'all',
      conditions: testCase.conditions,
      removeWhenNoLongerMatching: true,
    },
    new Date()
  );
  await saveRule(apiRoot, rule);

  const preview = await sweepAll(apiRoot, {
    rules: [rule],
    ctx,
    dryRun: true,
    pageSize: 100,
    maxPages: 50,
  });
  const applied = await sweepAll(apiRoot, {
    rules: [rule],
    ctx,
    pageSize: 100,
    maxPages: 50,
  });
  const again = await sweepAll(apiRoot, {
    rules: [rule],
    ctx,
    pageSize: 100,
    maxPages: 50,
  });
  const { total, sample } = await countIn(category.id);

  process.stdout.write(
    `\n${testCase.name} (${testCase.ruleName})\n` +
      `  preview would change ${preview.totals.productsChanged}, applied ${applied.totals.productsChanged}, ` +
      `re-run ${again.totals.productsChanged}\n` +
      `  category now holds ${total}\n`
  );
  for (const product of sample.slice(0, 3)) {
    process.stdout.write(`    ${product.masterVariant.sku ?? product.id} — ${product.name['en-US']}\n`);
  }

  check(total > 0, `${testCase.name}: the rule filled the category`, `${total} products`);
  check(
    again.totals.productsChanged === 0,
    `${testCase.name}: a second pass writes nothing`
  );
  check(
    preview.totals.productsChanged === applied.totals.productsChanged,
    `${testCase.name}: preview matched what was applied`
  );

  built.push({ ...testCase, category, total });
}

process.stdout.write('\n== The synchronous path: a new product, categorized in its own write\n');

const stamp = String(Date.now());
const productType = await apiRoot
  .productTypes()
  .withKey({ key: 'sample-general' })
  .get()
  .execute()
  .then((r) => r.body);

const { body: created } = await apiRoot
  .products()
  .post({
    body: {
      key: `autocat-matrix-${stamp}`,
      productType: { typeId: 'product-type', id: productType.id },
      // Matches New Arrivals (just created), Under $10 (price 4.99) and
      // Ramps & Loading (the name) — three rules in one write.
      name: { 'en-US': `Rubber Loading Ramp Wedge ${stamp}` },
      slug: { 'en-US': `autocat-matrix-${stamp}` },
      masterVariant: {
        sku: `MATRIX-${stamp}`,
        prices: [{ value: { currencyCode: 'USD', centAmount: 499 } }],
      },
      publish: true,
    },
  })
  .execute();

const landed = created.masterData.staged.categories.map((c) => c.id);
const expected = built
  .filter((b) => ['auto-new-arrivals', 'auto-clearance', 'auto-ramps'].includes(b.key))
  .map((b) => ({ key: b.key, id: b.category.id }));

for (const { key, id } of expected) {
  check(landed.includes(id), `new product landed in ${key} immediately`);
}
check(
  !landed.includes(built.find((b) => b.key === 'auto-premium').category.id),
  'new product stayed out of Big Ticket, which it does not match'
);
// A create whose Extension returns N actions lands at version 1 + N: the
// platform applies them as part of that request. The claim worth checking
// is that no SECOND request was needed, which the category assertions
// above already prove — this pins the arithmetic so a silent extra write
// would show up.
check(
  created.version === 1 + landed.length,
  'no second request — the version is the create plus its own actions',
  `version ${created.version}, ${landed.length} categories assigned`
);

process.stdout.write('\n== Removal: the product stops qualifying\n');

const { body: repriced } = await apiRoot
  .products()
  .withKey({ key: `autocat-matrix-${stamp}` })
  .post({
    body: {
      version: created.version,
      actions: [
        {
          action: 'changePrice',
          priceId: created.masterData.staged.masterVariant.prices[0].id,
          price: { value: { currencyCode: 'USD', centAmount: 29900 } },
          staged: false,
        },
      ],
    },
  })
  .execute();

const after = repriced.masterData.staged.categories.map((c) => c.id);
const clearance = built.find((b) => b.key === 'auto-clearance').category.id;
const premium = built.find((b) => b.key === 'auto-premium').category.id;

check(!after.includes(clearance), 'repricing to $299 removed it from Under $10');
check(after.includes(premium), 'repricing to $299 added it to Big Ticket');

process.stdout.write('\n== Summary\n');
for (const b of built) {
  const { total } = await countIn(b.category.id);
  process.stdout.write(`  ${b.category.slug['en-US']}  ${String(total).padStart(4)} products  ${b.name}\n`);
}

process.stdout.write(
  failures.length
    ? `\n${failures.length} check(s) failed:\n  - ${failures.join('\n  - ')}\n`
    : '\nEvery check passed.\n'
);
process.exit(failures.length ? 1 : 0);
