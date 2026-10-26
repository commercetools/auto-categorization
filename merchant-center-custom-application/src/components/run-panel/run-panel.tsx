/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import Card from '@commercetools-uikit/card';
import Constraints from '@commercetools-uikit/constraints';
import LoadingSpinner from '@commercetools-uikit/loading-spinner';
import PrimaryButton from '@commercetools-uikit/primary-button';
import SecondaryButton from '@commercetools-uikit/secondary-button';
import Spacings from '@commercetools-uikit/spacings';
import Stamp from '@commercetools-uikit/stamp';
import Text from '@commercetools-uikit/text';
import type { RunState } from '../../hooks/use-catalog-run';

/**
 * What a catalog pass looks like while it is happening.
 *
 * Preview and Process now are the same pass with one flag different, so
 * they sit together: a merchandiser can see exactly what a rule would do
 * before letting it do it, and the numbers mean the same thing either way.
 */

type RunPanelProps = {
  state: RunState;
  disabled?: boolean;
  onPreview: () => void;
  onRun: () => void;
  onStop: () => void;
  emptyMessage?: string;
};

const RunPanel = ({
  state,
  disabled,
  onPreview,
  onRun,
  onStop,
  emptyMessage = 'Preview to see what this rule would change, or process it against the catalog now.',
}: RunPanelProps) => {
  const totals = state.result?.totals;

  return (
    <Card type="raised" theme="light">
      <Spacings.Stack scale="m">
        <Spacings.Inline scale="s" alignItems="center">
          <SecondaryButton
            label="Preview"
            onClick={onPreview}
            isDisabled={disabled || state.running}
          />
          <PrimaryButton
            label="Process now"
            onClick={onRun}
            isDisabled={disabled || state.running}
          />
          {state.running && (
            <>
              <LoadingSpinner scale="s" />
              <SecondaryButton label="Stop" onClick={onStop} />
            </>
          )}
          {state.running && (
            <Text.Detail tone="secondary">
              {state.dryRun ? 'Previewing' : 'Processing'} — pass {state.laps}
            </Text.Detail>
          )}
        </Spacings.Inline>

        {state.error && (
          <Text.Body tone="critical" data-testid="run-error">
            {state.error}
          </Text.Body>
        )}

        {!totals && !state.error && (
          <Text.Detail tone="secondary">{emptyMessage}</Text.Detail>
        )}

        {totals && (
          <Constraints.Horizontal max="scale">
            <Spacings.Stack scale="s">
              <Spacings.Inline scale="s" alignItems="center">
                <Stamp
                  tone={state.dryRun ? 'information' : 'primary'}
                  label={state.dryRun ? 'Preview — nothing written' : 'Applied'}
                />
                {state.result?.done ? (
                  <Stamp tone="positive" label="Whole catalog covered" />
                ) : (
                  <Stamp tone="warning" label="Still walking the catalog" />
                )}
              </Spacings.Inline>

              <Text.Body>
                {totals.scanned} products checked · {totals.productsChanged}{' '}
                changed · {totals.added} added to the category ·{' '}
                {totals.removed} removed
              </Text.Body>

              {state.result?.sample?.length ? (
                <Spacings.Stack scale="xs">
                  <Text.Detail tone="secondary">
                    First {state.result.sample.length}:
                  </Text.Detail>
                  {state.result.sample.map((change) => (
                    <Text.Detail key={change.productId}>
                      {change.productKey ?? change.productId} —{' '}
                      {change.added.length ? 'added' : 'removed'}
                    </Text.Detail>
                  ))}
                </Spacings.Stack>
              ) : null}
            </Spacings.Stack>
          </Constraints.Horizontal>
        )}
      </Spacings.Stack>
    </Card>
  );
};

RunPanel.displayName = 'RunPanel';

export default RunPanel;
