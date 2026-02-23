# OC-Monitor（中文首页）

> 面向 OpenClaw 多节点场景的监控与告警面板。  
> **中文用户优先**：本页为完整中文说明。  
> English docs: **[README-English.md](./README-English.md)**

---

## 这是什么

OC-Monitor 是一个可自部署、可分享的轻量监控系统，核心目标是：

- 看清节点在线状态、资源健康与模型 Provider 可用性
- 把“故障发现-告警-确认-追踪”做成闭环
- 在不依赖重型平台的前提下快速落地（Node + SQLite + WebSocket）

---

## 项目演进（V0 → V2.5）

> 下面是从 0 到可用，再到分享就绪版本的完整演进与改造轨迹。

### V0（范围冻结 / 架构定稿）

**目标**：先把边界定清楚，避免做成“什么都想管”的大而全系统。  
**产出**：

- 明确职责：Server / Agent / Web 三层
- 数据与通信路径确定：Agent 心跳 → Server 入库 → Web 实时订阅
- 指标口径统一：CPU、内存、磁盘、在线状态、Provider 健康

---

### V1（可运行 MVP）

**目标**：先跑起来，先可观测。  
**落地内容**：

1. **Server（Node.js + SQLite）**
   - 提供心跳接收 API
   - 提供节点、日志查询 API
   - 提供基础健康检查接口
2. **WebSocket 实时推送**
   - 节点状态变化可实时广播到前端
3. **Agent（Bash/Python）**
   - 定时采集 CPU/内存/磁盘
   - 按 token 上报心跳
4. **部署脚本**
   - 最小安装步骤跑通
5. **基础压测**
   - 验证在多节点并发下 API 与心跳处理可用

---

### V2（监控台体验升级）

**目标**：从“能用”升级到“好用”。  
**落地内容**：

- 前端升级为 Mission Control 风格（深色卡片、KPI、Tab、节点卡）
- 双视图策略：默认脱敏 / 授权后完整
- Token 解锁能力
- 管理员登录与会话鉴权（`/api/admin/login|logout|me`）
- 亮/暗主题切换

---

### V2.5（生产可分享版）

**目标**：第三方可部署、可维护、可审计。  
**P0-P5 完整交付：**

- **P0 UI 收尾**：状态胶囊、Toast、登录/Token 弹窗重做
- **P1 告警中心**：offline / stale / cpu / mem / disk
- **P2 审计能力**：管理员登录/退出记录 + CSV 导出
- **P3 留存策略**：events 30 天、heartbeats 14 天、定时清理
- **P4 健康总览**：关键健康信息一屏化
- **P5 告警处理**：ACK 与静默 30 分钟

---

## V3-1 基础（已并入主线）

> 虽然你这次要求聚焦 V0-V2.5，但当前仓库已包含 V3-1 通知底座。

- critical 告警 Telegram 推送（默认关闭）
- 防抖间隔（默认 300 秒）
- 仅 actionable critical 触发通知

---

## 本次“分享就绪”改造（重点）

为保证仓库可公开免费分享、可被他人直接复用，本项目完成了以下处理：

1. **配置外置化**
   - 敏感项统一迁移到 `.env` / `.env.local`
   - 提供 `.env.example` 作为模板
2. **默认地址安全化**
   - Provider 默认地址改为 `127.0.0.1`
3. **安装脚本脱敏**
   - 避免硬编码私密配置
4. **文档补齐**
   - 中文完整安装、部署速览、演进记录

---

## 最终已落地功能清单

- 多节点状态总览
- Provider 健康矩阵
- 实时日志与状态流
- 告警中心（offline/stale/cpu/mem/disk）
- 告警 ACK / 静默
- 管理员登录与审计导出
- 数据留存与自动清理
- 健康总览一屏化
- critical 告警通知引擎（可开关）

---

## 目录结构

- `server/`：Node.js + SQLite + WebSocket 服务端
- `agent/`：节点采集与心跳上报脚本
- `web/`：前端看板（HTML/CSS/JS）
- `scripts/`：安装与运维脚本
- `docs/`：部署、演进与安装文档
- `.env.example`：分享友好配置模板

---

## 快速启动（中文）

```bash
cp .env.example .env
# 按需修改 .env

cd server
npm install
node index.js
```

访问：`http://<host>:<port>/`

---

## 文档导航

- 中文完整安装：[`docs/INSTALL_FULL_ZH.md`](./docs/INSTALL_FULL_ZH.md)
- 版本演进：[`docs/EVOLUTION_V0_TO_V31.md`](./docs/EVOLUTION_V0_TO_V31.md)
- 部署参考：[`docs/DEPLOY.md`](./docs/DEPLOY.md)
- English README：[`README-English.md`](./README-English.md)

---

## 署名

本阶段交付与整理署名：**gpt 5.3 codex**
