#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
# Freely available, AS IS and UNSUPPORTED. See LICENSE.

#
# Builds each application the way Connect does: the application folder on
# its own, with `npm ci` and then `npm run build`, and nothing else from
# the repository in reach.
#
# Connect's build container cannot see the repository root. An
# application that reaches outside its folder — a `file:../` dependency,
# a build script with `--prefix ..` — installs and builds perfectly on a
# developer's machine and fails there, ten minutes after you asked. This
# reproduces it in about a minute.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

APPS=(product-extension rules-api category-event sweep-job)
FAILED=0

for app in "${APPS[@]}"; do
  printf '%-22s ' "$app"
  cp -R "$ROOT/$app" "$WORK/$app"
  rm -rf "$WORK/$app/node_modules" "$WORK/$app/build"

  if (cd "$WORK/$app" && npm ci --no-audit --no-fund && npm run build) \
       > "$WORK/$app.log" 2>&1; then
    echo 'ci + build OK'
  else
    echo 'FAILED'
    tail -15 "$WORK/$app.log" | sed 's/^/    /'
    FAILED=1
  fi
done

if [ "$FAILED" -ne 0 ]; then
  echo
  echo 'An application cannot build from its own folder. Connect will fail the same way.'
  exit 1
fi

echo
echo 'Every application builds in isolation.'
