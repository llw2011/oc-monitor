#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$ROOT_DIR/server"
RUNTIME_DIR="$ROOT_DIR/runtime"
LOG_DIR="$RUNTIME_DIR/logs"
PID_FILE="$RUNTIME_DIR/server.pid"
ENV_FILE="$ROOT_DIR/.env"
ENV_LOCAL_FILE="$ROOT_DIR/.env.local"

mkdir -p "$RUNTIME_DIR" "$LOG_DIR"

if [[ ! -f "$ENV_FILE" && -f "$ROOT_DIR/.env.example" ]]; then
  cp "$ROOT_DIR/.env.example" "$ENV_FILE"
  echo "[init] .env not found, created from .env.example"
fi

# shellcheck disable=SC1090
[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" && set +a
# shellcheck disable=SC1090
[[ -f "$ENV_LOCAL_FILE" ]] && set -a && source "$ENV_LOCAL_FILE" && set +a

PORT="${PORT:-3888}"
DB_PATH="${DB_PATH:-$RUNTIME_DIR/monitor.db}"
SESSION_TTL_SEC="${SESSION_TTL_SEC:-86400}"
ALERT_NOTIFY_ENABLED="${ALERT_NOTIFY_ENABLED:-0}"
ALERT_NOTIFY_MIN_INTERVAL_SEC="${ALERT_NOTIFY_MIN_INTERVAL_SEC:-300}"
PROVIDER_TARGETS="${PROVIDER_TARGETS:-}"

TOKEN_FILE="$RUNTIME_DIR/dashboard.token"
PASS_FILE="$RUNTIME_DIR/admin.pass"
SECRET_FILE="$RUNTIME_DIR/session.secret"

rand_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    date +%s%N | sha256sum | cut -c1-$(($1*2))
  fi
}

[[ -f "$TOKEN_FILE" ]] || rand_hex 16 > "$TOKEN_FILE"
[[ -f "$PASS_FILE" ]] || rand_hex 8 > "$PASS_FILE"
[[ -f "$SECRET_FILE" ]] || rand_hex 16 > "$SECRET_FILE"

DASHBOARD_TOKEN="${DASHBOARD_TOKEN:-$(tr -d '\r\n\t ' < "$TOKEN_FILE")}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-$(tr -d '\r\n\t ' < "$PASS_FILE")}"
SESSION_SECRET="${SESSION_SECRET:-$(tr -d '\r\n\t ' < "$SECRET_FILE")}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

echo "[1/4] Installing server dependencies..."
cd "$SERVER_DIR"
npm install --silent

cat > "$RUNTIME_DIR/start-server.sh" <<EOF
#!/usr/bin/env bash
cd "$SERVER_DIR"
exec env \
  PORT="$PORT" \
  DB_PATH="$DB_PATH" \
  DASHBOARD_TOKEN="$DASHBOARD_TOKEN" \
  ADMIN_USER="$ADMIN_USER" \
  ADMIN_PASS="$ADMIN_PASS" \
  SESSION_SECRET="$SESSION_SECRET" \
  SESSION_TTL_SEC="$SESSION_TTL_SEC" \
  PROVIDER_TARGETS="$PROVIDER_TARGETS" \
  ALERT_NOTIFY_ENABLED="$ALERT_NOTIFY_ENABLED" \
  ALERT_NOTIFY_MIN_INTERVAL_SEC="$ALERT_NOTIFY_MIN_INTERVAL_SEC" \
  TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN" \
  TELEGRAM_CHAT_ID="$TELEGRAM_CHAT_ID" \
  node index.js
EOF
chmod +x "$RUNTIME_DIR/start-server.sh"

cat > "$RUNTIME_DIR/stop-server.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
RUNTIME_DIR="$(cd "$(dirname "$0")" && pwd)"
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
if curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null; then
  echo "Server OK: http://127.0.0.1:${PORT}"
else
  echo "Server health check failed"
  exit 1
fi

echo "[4/4] Done"
echo "Dashboard: http://127.0.0.1:${PORT}/"
echo "Dashboard token: ${DASHBOARD_TOKEN}"
echo "Admin user: ${ADMIN_USER}"
echo "Admin pass: ${ADMIN_PASS}"
echo "Logs: $LOG_DIR/server.out"
