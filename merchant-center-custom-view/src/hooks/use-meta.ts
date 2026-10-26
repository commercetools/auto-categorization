/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useEffect, useState } from 'react';
import type { Meta } from '../api/types';
import { useRulesApi } from '../api/rules-api';
import { rulesApiUrl } from '../helpers';

/** The field catalog, read from the API so it follows the Project's own attributes. */
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
