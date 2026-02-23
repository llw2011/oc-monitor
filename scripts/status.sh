#!/usr/bin/env bash
set -euo pipefail

RUNTIME_DIR="$HOME/.oc-monitor"
PID_FILE="$RUNTIME_DIR/server.pid"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "running (pid $(cat "$PID_FILE"))"
  curl -fsS http://127.0.0.1:3800/healthz || true
else
  echo "stopped"
fi
