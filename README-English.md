# OC-Monitor (English Homepage)

> A self-hosted multi-node monitoring and alert dashboard for OpenClaw environments.  
> Chinese-first docs: **[README.md](./README.md)**

---

## What is OC-Monitor

OC-Monitor is designed to be **practical, lightweight, and share-ready**:

- Track node availability and resource health in real time
- Observe provider health status in one dashboard
- Build an actionable loop: detect → alert → acknowledge → track
- Deploy quickly with a simple stack (Node.js + SQLite + WebSocket)

---

## Evolution (V0 → V3.1)

### V0 — Scope freeze
- Defined boundaries early to avoid scope explosion
- Locked architecture: `Server + Agent + Web`
- Locked the data flow: heartbeat ingestion and live status push

### V1 — Running MVP
- Server APIs + SQLite storage
- Agent registration + heartbeat reporting
- Node/log dashboard baseline
- WebSocket live updates
- Initial deployment scripts and baseline load validation

### V2 — UX and access control
- Mission Control style UI upgrade
- Default masked view + authorized full view
- Token unlock support
- Admin login/session endpoints
- Theme switching

### V2.5 — Operational hardening (P0-P5)
- P0: UI polish (status capsules, toast, dialog refinement)
- P1: Alert center (offline/stale/cpu/mem/disk)
- P2: Admin audit + CSV export
- P3: Retention policies + scheduled cleanup
- P4: One-screen health overview
- P5: Alert ACK + 30m mute

### V3.1 base — Notification engine
- Telegram critical alert notification (optional, disabled by default)
- Debounce interval support
- Notify only actionable critical alerts
- Notification state tracking for auditability

Detailed process notes: **[docs/EVOLUTION_V0_TO_V31.md](./docs/EVOLUTION_V0_TO_V31.md)**

---

## Final implemented capabilities

- Multi-node live status overview
- Provider health matrix
- Real-time logs and status stream
- Alert center with ACK/mute workflow
- Admin auth and audit export
- Data retention and periodic cleanup
- Health summary panel
- Optional Telegram critical alert push

---

## Project structure

- `server/` — Node.js + SQLite + WebSocket backend
- `agent/` — node-side collection and heartbeat scripts
- `web/` — dashboard frontend (HTML/CSS/JS)
- `scripts/` — install/ops helper scripts
- `docs/` — scope/evolution/deploy/install docs
- `.env.example` — share-safe configuration template

---

## Quick Start (Local Deployment, detailed)

> Recommended for first-time users. Default sample port is `3888`.

### 1) Prerequisites

- Linux / macOS / Windows (Linux recommended first)
- Node.js `v20+` (validated on `v22`)
- npm available

```bash
node -v
npm -v
```

### 2) Clone repository

```bash
git clone https://github.com/llw2011/oc-monitor.git
cd oc-monitor
```

### 3) Create local config

```bash
cp .env.example .env
```

At minimum, update these fields in `.env`:

```env
PORT=3888
DB_PATH=./server/monitor.db
DASHBOARD_TOKEN=replace_with_your_token
ADMIN_USER=admin
ADMIN_PASS=replace_with_your_admin_password
SESSION_SECRET=replace_with_a_long_random_string
```

### 4) Install dependencies

```bash
cd server
npm install
```

### 5) Start service

```bash
node index.js
```

Expected startup logs include lines like:
- `server listening on ...`
- `ws ready ...`

### 6) Open dashboard

- `http://127.0.0.1:3888/` (local)
- `http://<server-ip>:3888/` (LAN)

### 7) Health check

```bash
curl -s http://127.0.0.1:3888/healthz
```

Expected: `{"ok":true}` (or equivalent healthy JSON).

### 8) Fast troubleshooting

1. Port conflict → change `PORT` in `.env` and restart
2. Blank UI → check backend console errors first
3. Login fails → verify `ADMIN_USER/ADMIN_PASS`
4. No node data → agent is not reporting yet

More details: **[docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)**

---

## Documentation map

- Chinese full install guide: [docs/INSTALL_FULL_ZH.md](./docs/INSTALL_FULL_ZH.md)
- Evolution record: [docs/EVOLUTION_V0_TO_V31.md](./docs/EVOLUTION_V0_TO_V31.md)
- Scope (V1): [docs/v1-scope.md](./docs/v1-scope.md)
- Scope (V2): [docs/v2-scope.md](./docs/v2-scope.md)
- Scope (V3.1): [docs/v3.1-scope.md](./docs/v3.1-scope.md)
- Deployment notes: [docs/DEPLOY.md](./docs/DEPLOY.md)
- Chinese homepage: [README.md](./README.md)

---

## Signature

This stage of delivery is signed as: **gpt 5.3 codex**
