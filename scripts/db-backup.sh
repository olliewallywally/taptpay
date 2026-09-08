#!/usr/bin/env bash
# Operator-only encrypted backup. No ambient database selection or retention pruning.
# See docs/operations/encrypted-backup.md. Never run from app startup or CI.
set -euo pipefail
exec node "$(dirname "$0")/db-backup.mjs" "$@"
