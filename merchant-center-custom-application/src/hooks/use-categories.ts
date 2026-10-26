/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useEffect, useMemo } from 'react';
import { gql } from '@apollo/client';
import { useMcQuery } from '@commercetools-frontend/application-shell';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';

/**
 * The category tree, as both a flat list of pickable options and a
 * parented tree.
 *
 * Read through the Merchant Center API Gateway on the user's own session,
 * which is the only way a customization reaches the commerce APIs — and it
 * means a user who cannot see categories cannot pick one either.
 *
 * Every page is read, not just the first. A picker that browses a tree has
 * to hold the whole tree: a missing branch looks like a category that does
 * not exist, which is worse than a list that says it is incomplete.
 */

const PAGE_SIZE = 500;

const FETCH_CATEGORIES = gql`
  query FetchCategories($limit: Int!, $offset: Int!) {
    categories(
      limit: $limit
      offset: $offset
      sort: ["orderHint asc", "id asc"]
    ) {
      total
      results {
        id
        key
        nameAllLocales {
          locale
          value
        }
        parent {
          id
        }
        ancestors {
          id
          nameAllLocales {
            locale
            value
          }
        }
      }
    }
  }
`;

type CategoriesQuery = {
  categories: { total: number; results: CategoryNode[] };
};

type LocalizedField = { locale: string; value: string };

type CategoryNode = {
  id: string;
  key?: string | null;
  nameAllLocales: LocalizedField[];
  parent?: { id: string } | null;
  ancestors: { id: string; nameAllLocales: LocalizedField[] }[];
};

export type CategoryOption = {
  value: string;
  label: string;
  name: string;
  key?: string | null;
  /** Empty for a root category. */
  parentId?: string;
  /** How deep the category sits, so a tree can indent without walking up. */
  depth: number;
};

const localized = (fields: LocalizedField[], locale: string): string =>
  fields.find((field) => field.locale === locale)?.value ??
  fields[0]?.value ??
  '';

export const useCategories = (locale: string) => {
  const { data, error, loading, fetchMore } = useMcQuery<CategoriesQuery>(
    FETCH_CATEGORIES,
    {
      variables: { limit: PAGE_SIZE, offset: 0 },
      context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
      notifyOnNetworkStatusChange: true,
    }
  );

  const nodes: CategoryNode[] = useMemo(
    () => data?.categories.results ?? [],
    [data]
  );
  const total = data?.categories.total ?? 0;

  // Read the next page as soon as one lands short of the total. Apollo
  // merges into the same cache entry, so `nodes` grows and this settles
  // once the tree is whole.
  useEffect(() => {
    if (loading || !nodes.length || nodes.length >= total) return;
    fetchMore({
      variables: { limit: PAGE_SIZE, offset: nodes.length },
      updateQuery: (
        previous: CategoriesQuery,
        { fetchMoreResult }: { fetchMoreResult?: CategoriesQuery }
      ) => {
        if (!fetchMoreResult) return previous;
        return {
          categories: {
            ...fetchMoreResult.categories,
            results: [
              ...previous.categories.results,
              ...fetchMoreResult.categories.results,
            ],
          },
        };
      },
    }).catch(() => {
      // A failed page leaves the tree short rather than empty; `complete`
      // below is what tells the caller, and the picker says so.
    });
  }, [fetchMore, loading, nodes.length, total]);

  const categories: CategoryOption[] = useMemo(
    () =>
      nodes.map((category) => {
        const name = localized(category.nameAllLocales, locale);
        const path = [
          ...category.ancestors.map((ancestor) =>
            localized(ancestor.nameAllLocales, locale)
          ),
          name,
        ];
        return {
          value: category.id,
          label: path.join(' › '),
          name,
          key: category.key,
          parentId: category.parent?.id,
          depth: category.ancestors.length,
        };
      }),
    [nodes, locale]
  );

  return {
    categories,
    total,
    /** False while pages are still arriving, or if one of them failed. */
    complete: total > 0 && categories.length >= total,
    error,
    loading,
  };
};

export const useCategoryName = (locale: string, categoryId?: string) => {
  const { categories, loading } = useCategories(locale);
  const match = categories.find((category) => category.value === categoryId);
  return { label: match?.label, name: match?.name, loading };
};
