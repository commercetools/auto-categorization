/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Request, Response } from 'express';
import {
  OPERATORS_BY_VALUE_KIND,
  OPERATOR_LABELS,
  RuleValidationError,
  buildFieldCatalog,
  deleteRule,
  enqueueSweep,
  getRule,
  getRunSummary,
  listRules,
  loadEvaluationContext,
  saveRule,
  toRule,
  validateRule,
} from '../shared';
import { createApiRoot } from '../client/create.client';
import { readConfiguration } from '../utils/config.utils';
import { logger } from '../utils/logger.utils';
import CustomError from '../errors/custom.error';
import { runChunk } from '../handlers/run.handler';

/**
 * The API behind both Merchant Center surfaces.
 *
 * Rules are validated here rather than in the browser, because the browser
 * is not the only thing that can call this and a malformed rule is a
 * malformed catalog pass. The field catalog is served from here too, so the
 * builder's choices come from the Project's own Product Types instead of a
 * list someone has to keep in step.
 */

export const meta = async (_request: Request, response: Response) => {
  const apiRoot = createApiRoot();
  const { productTypes } = await loadEvaluationContext(apiRoot);
  const { body: project } = await apiRoot.get().execute();

  response.status(200).send({
    fields: buildFieldCatalog(productTypes),
    operatorsByValueKind: OPERATORS_BY_VALUE_KIND,
    operatorLabels: OPERATOR_LABELS,
    languages: project.languages,
    currencies: project.currencies,
  });
};

export const list = async (request: Request, response: Response) => {
  const rules = await listRules(createApiRoot());
  const categoryId = request.query.categoryId;

  response.status(200).send({
    rules:
      typeof categoryId === 'string'
        ? rules.filter((rule) => rule.categoryId === categoryId)
        : rules,
  });
};

export const read = async (request: Request, response: Response) => {
  const rule = await getRule(createApiRoot(), request.params.key);
  if (!rule) throw new CustomError(404, 'No such rule');
  response.status(200).send({ rule });
};

export const upsert = async (request: Request, response: Response) => {
  const apiRoot = createApiRoot();
  const draft = { ...(request.body ?? {}), key: request.params.key };

  const issues = validateRule(draft);
  if (issues.length) throw new RuleValidationError(issues);

  const existing = await getRule(apiRoot, draft.key);
  const rule = toRule(draft, new Date(), existing);
  const saved = await saveRule(apiRoot, rule);

  // The rule's own category needs re-deciding across the whole catalog, and
  // so does the one it just stopped pointing at.
  await enqueueSweep(apiRoot, saved.categoryId);
  if (existing && existing.categoryId !== saved.categoryId) {
    await enqueueSweep(apiRoot, existing.categoryId);
  }

  logger.info({
    message: existing ? 'Rule updated' : 'Rule created',
    ruleKey: saved.key,
    categoryId: saved.categoryId,
    userId: request.session?.userId,
  });

  response.status(existing ? 200 : 201).send({ rule: saved });
};

export const remove = async (request: Request, response: Response) => {
  const apiRoot = createApiRoot();
  const existing = await getRule(apiRoot, request.params.key);
  if (!existing) throw new CustomError(404, 'No such rule');

  await deleteRule(apiRoot, request.params.key);
  // Products the rule was holding in place need releasing.
  await enqueueSweep(apiRoot, existing.categoryId);

  logger.info({
    message: 'Rule deleted',
    ruleKey: existing.key,
    userId: request.session?.userId,
  });

  response.status(204).send();
};

export const runRule = async (request: Request, response: Response) => {
  const apiRoot = createApiRoot();
  const rule = await getRule(apiRoot, request.params.key);
  if (!rule) throw new CustomError(404, 'No such rule');

  response
    .status(200)
    .send(await run(apiRoot, 'rule', rule.key, [rule], request));
};

export const runCategory = async (request: Request, response: Response) => {
  const apiRoot = createApiRoot();
  const categoryId = request.params.id;
  const rules = (await listRules(apiRoot)).filter(
    (rule) => rule.categoryId === categoryId
  );

  if (rules.length === 0) throw new CustomError(404, 'No rules on this category');

  response
    .status(200)
    .send(await run(apiRoot, 'category', categoryId, rules, request));
};

export const runAll = async (request: Request, response: Response) => {
  const apiRoot = createApiRoot();
  const rules = await listRules(apiRoot);
  response.status(200).send(await run(apiRoot, 'all', 'all', rules, request));
};

export const lastRun = async (request: Request, response: Response) => {
  const scope = request.params.scope as 'rule' | 'category' | 'all';
  if (scope !== 'rule' && scope !== 'category' && scope !== 'all') {
    throw new CustomError(400, 'scope must be rule, category or all');
  }

  const summary = await getRunSummary(
    createApiRoot(),
    scope,
    request.params.target
  );

  response.status(200).send({ run: summary ?? null });
};

export const status = (_request: Request, response: Response) => {
  response.status(200).send({ status: 'ok' });
};

async function run(
  apiRoot: ReturnType<typeof createApiRoot>,
  scope: 'rule' | 'category' | 'all',
  target: string,
  rules: Parameters<typeof runChunk>[1]['rules'],
  request: Request
) {
  const config = readConfiguration();
  const { ctx } = await loadEvaluationContext(apiRoot);
  const dryRun = request.body?.dryRun === true;

  const result = await runChunk(apiRoot, {
    scope,
    target,
    rules: rules.filter((rule) => rule.enabled || scope === 'rule'),
    ctx,
    cursor:
      typeof request.body?.cursor === 'string' ? request.body.cursor : undefined,
    dryRun,
    pageSize: config.pageSize,
    maxPages: config.maxPagesPerRequest,
    budgetSeconds: config.requestBudgetSeconds,
  });

  logger.info({
    message: dryRun ? 'Preview chunk complete' : 'Run chunk complete',
    scope,
    target,
    done: result.done,
    totals: result.totals,
    userId: request.session?.userId,
  });

  return result;
}
