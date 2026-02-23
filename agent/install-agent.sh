#!/usr/bin/env bash
set -euo pipefail

SERVER=""
NAME="$(hostname)"
INTERVAL="15"

while getopts ":s:n:i:" opt; do
  case $opt in
    s) SERVER="$OPTARG" ;;
    n) NAME="$OPTARG" ;;
    i) INTERVAL="$OPTARG" ;;
    *) echo "Usage: $0 -s <server_url> [-n node_name] [-i interval]"; exit 1 ;;
  esac
done

if [[ -z "$SERVER" ]]; then
  echo "Usage: $0 -s <server_url> [-n node_name] [-i interval]"
  exit 1
fi

BASE_DIR="$HOME/.oc-monitor-agent"
mkdir -p "$BASE_DIR"
cp "$(dirname "$0")/agent.py" "$BASE_DIR/agent.py"
chmod +x "$BASE_DIR/agent.py"

cat > "$BASE_DIR/run.sh" <<EOF
#!/usr/bin/env bash
exec python3 "$BASE_DIR/agent.py" --server "$SERVER" --name "$NAME" --interval "$INTERVAL"
EOF
chmod +x "$BASE_DIR/run.sh"

if command -v systemctl >/dev/null 2>&1; then
  UNIT_PATH="$HOME/.config/systemd/user/oc-monitor-agent.service"
  mkdir -p "$(dirname "$UNIT_PATH")"
  cat > "$UNIT_PATH" <<EOF
[Unit]
Description=OC Monitor Agent
After=network-online.target

[Service]
ExecStart=$BASE_DIR/run.sh
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now oc-monitor-agent.service || true
  echo "Installed as user systemd service: oc-monitor-agent.service"
else
  nohup "$BASE_DIR/run.sh" >/tmp/oc-monitor-agent.log 2>&1 &
  echo $! > "$BASE_DIR/agent.pid"
  echo "Started in background, pid: $(cat "$BASE_DIR/agent.pid")"
fi

echo "Done."
