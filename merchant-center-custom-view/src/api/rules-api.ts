/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useMemo } from 'react';
import { useAsyncDispatch, actions } from '@commercetools-frontend/sdk';
import type { TSdkAction } from '@commercetools-frontend/sdk';
import type { Meta, Rule, RunResponse, RunSummary } from './types';

/**
 * Talking to the rules API.
 *
 * Never directly: every call goes through the Merchant Center API Gateway's
 * /proxy/forward-to, which checks the signed-in user has access to this
 * Project and then forwards the request with a short-lived signed token
 * addressed to the API's origin. The API verifies that token, so the
 * browser holds no credential of any kind and it is the user's own
 * identity that reaches the backend.
 *
 * `includeUserPermissions` is set on every request because the API refuses
 * anything without it. Reading rules and rewriting a category's membership
 * are different rights, and the gateway is the only thing that can say
 * which of them this user holds.
 */

export const useRulesApi = (baseUrl: string) => {
  const dispatch = useAsyncDispatch<TSdkAction, unknown>();

  return useMemo(() => {
    const get = <T>(path: string) =>
      dispatch(
        actions.forwardTo.get({
          uri: `${baseUrl}${path}`,
          includeUserPermissions: true,
        })
      ) as Promise<T>;

    const post = <T>(path: string, payload: unknown) =>
      dispatch(
        actions.forwardTo.post({
          uri: `${baseUrl}${path}`,
          payload,
          includeUserPermissions: true,
        })
      ) as Promise<T>;

    return {
      meta: () => get<Meta>('/meta'),

      listRules: (categoryId?: string) =>
        get<{ rules: Rule[] }>(
          categoryId
            ? `/rules?categoryId=${encodeURIComponent(categoryId)}`
            : '/rules'
        ).then((body) => body.rules),

      getRule: (key: string) =>
        get<{ rule: Rule }>(`/rules/${encodeURIComponent(key)}`).then(
          (body) => body.rule
        ),

      // POST rather than PUT: the gateway's forwardTo helpers cover GET,
      // POST, HEAD and DELETE, and the API accepts either verb for an
      // upsert, so the client never has to hand-roll a request.
      saveRule: (rule: Omit<Rule, 'createdAt' | 'updatedAt'>) =>
        post<{ rule: Rule }>(
          `/rules/${encodeURIComponent(rule.key)}`,
          rule
        ).then((body) => body.rule),

      deleteRule: (key: string) =>
        dispatch(
          actions.forwardTo.del({
            uri: `${baseUrl}/rules/${encodeURIComponent(key)}`,
            includeUserPermissions: true,
          })
        ) as Promise<unknown>,

      runRule: (key: string, body: { cursor?: string; dryRun?: boolean }) =>
        post<RunResponse>(`/rules/${encodeURIComponent(key)}/run`, body),

      runCategory: (
        categoryId: string,
        body: { cursor?: string; dryRun?: boolean }
      ) =>
        post<RunResponse>(
          `/categories/${encodeURIComponent(categoryId)}/run`,
          body
        ),

      lastRun: (scope: RunSummary['scope'], target: string) =>
        get<{ run: RunSummary | null }>(
          `/runs/${scope}/${encodeURIComponent(target)}`
        ).then((body) => body.run),
    };
  }, [dispatch, baseUrl]);
};

export type RulesApi = ReturnType<typeof useRulesApi>;
