#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$ROOT_DIR/server"
RUNTIME_DIR="$HOME/.oc-monitor"
LOG_DIR="$RUNTIME_DIR/logs"
PID_FILE="$RUNTIME_DIR/server.pid"

mkdir -p "$RUNTIME_DIR" "$LOG_DIR"

echo "[1/4] Installing server dependencies..."
cd "$SERVER_DIR"
npm install --silent

# Optional runtime DB path
DB_PATH="$RUNTIME_DIR/monitor.db"
TOKEN_FILE="$RUNTIME_DIR/dashboard.token"
if [[ ! -f "$TOKEN_FILE" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16 > "$TOKEN_FILE"
  else
    date +%s%N | sha256sum | cut -c1-32 > "$TOKEN_FILE"
  fi
fi
DASHBOARD_TOKEN="$(tr -d '\r\n\t ' < "$TOKEN_FILE")"
cat > "$RUNTIME_DIR/start-server.sh" <<EOF
#!/usr/bin/env bash
cd "$SERVER_DIR"
exec env PORT=3800 DB_PATH="$DB_PATH" DASHBOARD_TOKEN="$DASHBOARD_TOKEN" node index.js
EOF
chmod +x "$RUNTIME_DIR/start-server.sh"

cat > "$RUNTIME_DIR/stop-server.sh" <<'EOF'
#!/usr/bin/env bash
RUNTIME_DIR="$HOME/.oc-monitor"
PID_FILE="$RUNTIME_DIR/server.pid"
if [[ -f "$PID_FILE" ]]; then
  kill "$(cat "$PID_FILE")" 2>/dev/null || true
  rm -f "$PID_FILE"
fi
EOF
chmod +x "$RUNTIME_DIR/stop-server.sh"

echo "[2/4] Restarting server..."
"$RUNTIME_DIR/stop-server.sh"
nohup "$RUNTIME_DIR/start-server.sh" > "$LOG_DIR/server.out" 2>&1 &
echo $! > "$PID_FILE"

sleep 1

echo "[3/4] Health check..."
if curl -fsS "http://127.0.0.1:3800/healthz" >/dev/null; then
  echo "Server OK: http://127.0.0.1:3800"
else
  echo "Server health check failed"
  exit 1
fi

echo "[4/4] Done"
echo "Dashboard: http://127.0.0.1:3800/"
echo "Dashboard token: $(cat "$TOKEN_FILE")"
echo "Token file: $TOKEN_FILE"
echo "Logs: $LOG_DIR/server.out"
