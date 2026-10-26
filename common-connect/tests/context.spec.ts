/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk/dist/declarations/src/generated/client/by-project-key-request-builder';
import { loadEvaluationContext } from '../src/context';

/**
 * Reading the Project needs `view_project_settings`. A connector that only
 * categorizes products has no other use for it, so an installer may not
 * grant it — and a rule engine that stops working entirely because one
 * optional read was refused is the worst possible failure: silent, total,
 * and indistinguishable from "no rule matched".
 */
function apiRootWith(projectRead: () => Promise<unknown>) {
  return {
    productTypes: () => ({
      get: () => ({
        execute: async () => ({
          body: {
            results: [
              { id: 'pt-1', key: 'general', attributes: [] },
            ],
          },
        }),
      }),
    }),
    get: () => ({ execute: projectRead }),
  } as unknown as ByProjectKeyRequestBuilder;
}

describe('loadEvaluationContext', () => {
  it('uses the Project currencies when it may read them', async () => {
    const { ctx } = await loadEvaluationContext(
      apiRootWith(async () => ({ body: { currencies: ['JPY', 'USD'] } }))
    );

    expect(ctx.defaultCurrency).toBe('JPY');
    expect(ctx.fractionDigitsByCurrency).toEqual({ JPY: 0, USD: 2 });
  });

  it('still resolves product types when the Project read is refused', async () => {
    const forbidden = Object.assign(new Error('Forbidden'), { statusCode: 403 });

    const { ctx, productTypes } = await loadEvaluationContext(
      apiRootWith(async () => {
        throw forbidden;
      })
    );

    expect(productTypes).toHaveLength(1);
    expect(ctx.productTypeKeyById).toEqual({ 'pt-1': 'general' });
    expect(ctx.defaultCurrency).toBeUndefined();
  });
});
