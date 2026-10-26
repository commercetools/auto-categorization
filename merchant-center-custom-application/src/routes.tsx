/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ReactNode } from 'react';
import { Switch, Route, useRouteMatch } from 'react-router-dom';
import LoadingSpinner from '@commercetools-uikit/loading-spinner';
import Spacings from '@commercetools-uikit/spacings';
import Text from '@commercetools-uikit/text';
import RulesOverview from './components/rules-overview/rules-overview';
import RuleEditor from './components/rule-editor/rule-editor';
import { useMeta } from './hooks/use-meta';

type ApplicationRoutesProps = {
  children?: ReactNode;
};

/**
 * Two screens: the list of rules, and one rule.
 *
 * The field catalog is loaded once here and handed down, so switching
 * between them does not re-read it and the two screens cannot disagree
 * about what a field is called.
 *
 * The Custom Application already refuses to render without the View
 * permission, so there is no permission check at this level; the Manage
 * permission is checked where it matters, on the controls that write.
 */
const ApplicationRoutes = (_props: ApplicationRoutesProps) => {
  const match = useRouteMatch();
  const { meta, error, loading } = useMeta();

  if (loading) {
    return (
      <Spacings.Inset scale="l">
        <LoadingSpinner />
      </Spacings.Inset>
    );
  }

  if (error || !meta) {
    return (
      <Spacings.Inset scale="l">
        <Spacings.Stack scale="s">
          <Text.Headline as="h2">The rules API is not reachable</Text.Headline>
          <Text.Body tone="critical">{error}</Text.Body>
          <Text.Detail tone="secondary">
            Check that RULES_API_URL on this deployment points at the
            rules-api application, and that your Merchant Center user holds
            the Auto-categorization permission.
          </Text.Detail>
        </Spacings.Stack>
      </Spacings.Inset>
    );
  }

  return (
    <Spacings.Inset scale="l">
      <Switch>
        <Route path={`${match.path}/new`}>
          <RuleEditor meta={meta} backUrl={match.url} />
        </Route>
        <Route path={`${match.path}/:ruleKey`}>
          <RuleEditor meta={meta} backUrl={match.url} />
        </Route>
        <Route>
          <RulesOverview meta={meta} baseUrl={match.url} />
        </Route>
      </Switch>
    </Spacings.Inset>
  );
};
ApplicationRoutes.displayName = 'ApplicationRoutes';

export default ApplicationRoutes;
