/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ReactNode } from 'react';
import LoadingSpinner from '@commercetools-uikit/loading-spinner';
import Spacings from '@commercetools-uikit/spacings';
import Text from '@commercetools-uikit/text';
import CategoryRulesPanel from './components/category-rules-panel/category-rules-panel';
import { useMeta } from './hooks/use-meta';

type ApplicationRoutesProps = {
  children?: ReactNode;
};

/**
 * A Custom View has no routes of its own — it is one panel on somebody
 * else's page. The only thing this layer does is get the field catalog in
 * hand before the panel needs it.
 *
 * The Custom View already refuses to render without the View permission,
 * so the Manage permission is what gets checked, and it is checked on the
 * controls that write.
 */
const ApplicationRoutes = (_props: ApplicationRoutesProps) => {
  const { meta, error, loading } = useMeta();

  if (loading) return <LoadingSpinner />;

  if (error || !meta) {
    return (
      <Spacings.Stack scale="xs">
        <Text.Body tone="critical">The rules API is not reachable.</Text.Body>
        <Text.Detail tone="secondary">{error}</Text.Detail>
      </Spacings.Stack>
    );
  }

  return <CategoryRulesPanel meta={meta} />;
};
ApplicationRoutes.displayName = 'ApplicationRoutes';

export default ApplicationRoutes;
