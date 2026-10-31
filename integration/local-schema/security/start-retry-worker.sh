#!/usr/bin/env bash
set -eu
# Called by the supervisor below, not the hosted application. Never source project .env.
: "${DELETION_LOCAL_ENV_FILE:?Independent local environment file required}"
case "$DELETION_LOCAL_ENV_FILE" in /*) ;; *) echo 'Absolute independent environment path required' >&2; exit 1;; esac
PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
case "$DELETION_LOCAL_ENV_FILE" in "$PROJECT_ROOT"/*) echo 'Environment file must be outside the project' >&2; exit 1;; esac
test -f "$DELETION_LOCAL_ENV_FILE"
ENV_REAL="$(realpath "$DELETION_LOCAL_ENV_FILE")"
case "$ENV_REAL" in "$PROJECT_ROOT"/*) echo 'Project environment files are forbidden' >&2; exit 1;; esac
cd /tmp
exec env -i PATH="$PATH" HOME="$HOME" bun --env-file="$ENV_REAL" "$PROJECT_ROOT/integration/local-schema/security/retry-deletions.ts"