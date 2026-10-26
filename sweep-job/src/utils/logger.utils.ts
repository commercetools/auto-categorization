/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Structured logging, in about thirty lines.
 *
 * JSON to stdout, which is what Connect's log collector reads, and one
 * line per event so a correlation key can be grepped. Written here rather
 * than taken from a logging library because the only thing this connector
 * needs is `JSON.stringify` — and the obvious library pulls in winston and
 * lodash, which is a large dependency tree with open advisories sitting on
 * the critical path of every product write.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const threshold =
  LEVELS[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? LEVELS.info;

const write = (level: Level, payload: unknown) => {
  if (LEVELS[level] < threshold) return;

  const fields =
    typeof payload === 'string' ? { message: payload } : { ...(payload as object) };

  const line = JSON.stringify({
    severity: level.toUpperCase(),
    timestamp: new Date().toISOString(),
    ...fields,
  });

  // process.stdout rather than console, so a `no-console` lint rule stays
  // meaningful everywhere else in the codebase.
  (level === 'error' ? process.stderr : process.stdout).write(`${line}\n`);
};

export const logger = {
  debug: (payload: unknown) => write('debug', payload),
  info: (payload: unknown) => write('info', payload),
  warn: (payload: unknown) => write('warn', payload),
  error: (payload: unknown) => write('error', payload),
};
