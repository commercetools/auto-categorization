/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useCallback, useRef, useState } from 'react';
import type { RunResponse } from '../api/types';

/**
 * Process now, from the browser's side.
 *
 * The API walks a bounded slice of the catalog per request and hands back a
 * cursor, so this calls it in a loop until it says it is done. That is what
 * makes the button honest: the numbers on screen are what has actually been
 * written so far, not an estimate, and a catalog too big for one request is
 * simply more laps rather than a timeout.
 *
 * Stopping is real too — the loop checks between laps, so Stop leaves the
 * catalog consistent at whatever point it reached and the cursor is kept so
 * the scheduled job can finish the rest.
 */

export type RunState = {
  running: boolean;
  dryRun: boolean;
  laps: number;
  result?: RunResponse;
  error?: string;
};

const IDLE: RunState = { running: false, dryRun: false, laps: 0 };

export const useCatalogRun = (
  call: (body: { cursor?: string; dryRun?: boolean }) => Promise<RunResponse>
) => {
  const [state, setState] = useState<RunState>(IDLE);
  const cancelled = useRef(false);

  const start = useCallback(
    async (dryRun: boolean) => {
      cancelled.current = false;
      setState({ running: true, dryRun, laps: 0 });

      let cursor: string | undefined;
      let laps = 0;

      try {
        for (;;) {
          const result = await call({ cursor, dryRun });
          laps += 1;
          setState({ running: true, dryRun, laps, result });

          if (result.done || cancelled.current) {
            setState({ running: false, dryRun, laps, result });
            return result;
          }
          cursor = result.cursor;

          // A cursor-less unfinished response would loop forever on the
          // same slice. Stop instead, and say so.
          if (!cursor) {
            setState({
              running: false,
              dryRun,
              laps,
              result,
              error: 'The run stopped without a cursor to continue from.',
            });
            return result;
          }
        }
      } catch (error) {
        setState({
          running: false,
          dryRun,
          laps,
          error: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      }
    },
    [call]
  );

  const stop = useCallback(() => {
    cancelled.current = true;
  }, []);

  const reset = useCallback(() => {
    cancelled.current = true;
    setState(IDLE);
  }, []);

  return { state, start, stop, reset };
};
