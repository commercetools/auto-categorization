#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
# Freely available, AS IS and UNSUPPORTED. See LICENSE.

# Runs live-check.mjs against a real Project.
#
# Credentials come from an env file passed as the first argument, read
# rather than sourced — a CTP_SCOPES line contains spaces and sourcing it
# runs the scope name as a command.
set -euo pipefail
ENV_FILE="${1:?usage: run-live-check.sh <path-to-.env> [extra VAR=value ...]}"
shift
eval "$(
  grep -E '^CTP_[A-Z_]+=' "$ENV_FILE" |
  while IFS='=' read -r key value; do
    printf 'export %s=%q\n' "$key" "$value"
  done
)"
env "$@" node "$(dirname "$0")/${SCRIPT:-live-check.mjs}"
