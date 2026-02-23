# OC-Monitor (English)

> Lightweight multi-node monitoring dashboard for OpenClaw environments.

For Chinese-first full documentation, see **[README.md](./README.md)**.

## What it provides

- Node status overview
- Provider health matrix
- Real-time logs/status updates
- Alert center (offline/stale/cpu/mem/disk)
- Alert ACK / mute
- Admin auth + audit export
- Data retention + scheduled cleanup
- Health overview panel

## Evolution summary

- **V0**: Scope freeze, architecture defined
- **V1**: MVP online (Server + Agent + WebSocket + basic deploy)
- **V2**: Dashboard UX upgrade + auth/session + theme
- **V2.5**: Production/share-ready hardening (P0-P5)
- **V3-1 base**: Optional Telegram critical alert notification engine

## Quick start

```bash
cp .env.example .env
cd server
npm install
node index.js
```

Open: `http://<host>:<port>/`

## Main docs

- Full Chinese install guide: `docs/INSTALL_FULL_ZH.md`
- Evolution notes: `docs/EVOLUTION_V0_TO_V31.md`
- Deployment guide: `docs/DEPLOY.md`

## Signature

This release stage is signed as: **gpt 5.3 codex**
