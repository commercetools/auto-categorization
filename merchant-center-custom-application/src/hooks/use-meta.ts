/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useEffect, useState } from 'react';
import type { Meta } from '../api/types';
import { useRulesApi } from '../api/rules-api';
import { rulesApiUrl } from '../helpers';

/**
 * The field catalog, read once per visit.
 *
 * It comes from the API rather than being written into the bundle, because
 * the attributes a rule can read are the Project's own Product Types —
 * adding an attribute in the Merchant Center should put it in the rule
 * builder without a redeploy.
 */
export const useMeta = () => {
  const api = useRulesApi(rulesApiUrl());
  const [meta, setMeta] = useState<Meta>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    api
      .meta()
      .then((result) => {
        if (live) setMeta(result);
      })
      .catch((caught) => {
        if (live) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [api]);

  return { meta, error, loading };
};
