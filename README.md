# OC-Monitor

多节点 OpenClaw 监控面板（V2.5 + V3-1 基础）。

## 目录结构

- `server/`：Node.js + SQLite + WebSocket 服务端
- `agent/`：节点采集与心跳上报脚本（Bash + Python3）
- `web/`：前端看板（原生 HTML/CSS/JS）
- `scripts/`：安装与运维脚本
- `docs/`：设计与范围文档
- `.env.example`：可分享部署模板（推荐）

## 快速启动（分享友好）

1. 复制配置模板

```bash
cp .env.example .env
# 按需修改 .env
```

2. 安装服务端依赖

```bash
cd server
npm install
```

3. 启动

```bash
node index.js
```

4. 打开 Dashboard

- `http://<host>:<port>/`

## 配置原则（第三方部署）

- **所有敏感项放在 `.env`**，不要写死在脚本里
- 可选放在 `.env.local`（优先级高于 `.env`）
- 通知默认关闭：`ALERT_NOTIFY_ENABLED=0`
- 需要 Telegram 通知时再填 `TELEGRAM_BOT_TOKEN` 与 `TELEGRAM_CHAT_ID`

## 当前能力

- 节点总览 + Provider 健康矩阵 + 日志
- 告警中心（offline/stale/cpu/mem/disk）
- 告警 ACK / 静默
- 管理员审计 + CSV 导出
- 留存策略 + 定时清理
- 健康总览
- V3-1：critical 告警通知引擎（可开关）
