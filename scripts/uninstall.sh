#!/usr/bin/env bash
set -euo pipefail

RUNTIME_DIR="$HOME/.oc-monitor"
PID_FILE="$RUNTIME_DIR/server.pid"

if [[ -f "$PID_FILE" ]]; then
  kill "$(cat "$PID_FILE")" 2>/dev/null || true
  rm -f "$PID_FILE"
fi

echo "OC-Monitor server stopped."
