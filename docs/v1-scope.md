# OC-Monitor V1 Scope（Step 0 冻结）

## 1) 目标（V1 必做）

交付一个可运行、可部署的多节点监控 MVP，包含：

1. **Agent 注册 + 心跳上报**
2. **节点实时状态看板**（CPU / 内存 / 磁盘 / Swap / 在线状态）
3. **事件日志入库 + 分页查询**
4. **WebSocket 实时推送**（状态变化实时刷新）

---

## 2) 非目标（V1 不做）

以下内容明确不进入 V1，避免 scope 膨胀：

- 供应商健康矩阵（Provider Matrix）
- 登录/权限分层（未登录脱敏、Token 解锁等）
- 告警通知（Telegram/飞书/Webhook）
- 高级图表与复杂筛选器
- 多租户/组织管理
- 灰度发布、HA 集群、分布式存储

---

## 3) 运行架构（V1）

- **Server**：Node.js + SQLite + WebSocket
- **Agent**：Bash + Python3（节点侧采集并上报）
- **Web**：原生 HTML/CSS/JS（零框架）

---

## 4) 数据模型冻结（V1）

> 字段先冻结，减少后续反复改表。允许新增字段，但不删除核心字段。

### 4.1 agents（节点注册信息）

- `id` (TEXT, PK)
- `token` (TEXT, UNIQUE)
- `name` (TEXT)
- `hostname` (TEXT)
- `ip` (TEXT)
- `os` (TEXT)
- `created_at` (INTEGER, unix)
- `updated_at` (INTEGER, unix)
- `enabled` (INTEGER, default 1)

### 4.2 heartbeats（心跳快照）

- `id` (INTEGER, PK AUTOINCREMENT)
- `agent_id` (TEXT, INDEX)
- `ts` (INTEGER, INDEX)
- `cpu_percent` (REAL)
- `mem_used_bytes` (INTEGER)
- `mem_total_bytes` (INTEGER)
- `disk_used_bytes` (INTEGER)
- `disk_total_bytes` (INTEGER)
- `swap_used_bytes` (INTEGER)
- `swap_total_bytes` (INTEGER)
- `uptime_sec` (INTEGER)
- `load_1m` (REAL)

### 4.3 events（事件/日志）

- `id` (INTEGER, PK AUTOINCREMENT)
- `ts` (INTEGER, INDEX)
- `agent_id` (TEXT, INDEX)
- `level` (TEXT)  // info/warn/error
- `type` (TEXT)   // register/heartbeat/offline/system
- `message` (TEXT)
- `meta_json` (TEXT, nullable)

---

## 5) API 边界冻结（V1）

### 5.1 Agent API

- `POST /api/agent/register`
  - 入参：`name`, `hostname`, `ip`, `os`
  - 出参：`agent_id`, `token`

- `POST /api/agent/heartbeat`
  - Header：`Authorization: Bearer <token>`
  - 入参：资源快照字段（CPU/内存/磁盘/Swap/uptime/load）
  - 出参：`ok: true`

### 5.2 Dashboard API

- `GET /api/nodes`
  - 返回各节点最新状态 + online/offline 判定

- `GET /api/logs?page=1&pageSize=50&level=&type=&agent_id=`
  - 返回分页日志

### 5.3 实时接口

- `GET /ws`（WebSocket）
  - 事件：`node:update`, `event:new`, `ping`

---

## 6) 在线/离线判定规则（V1）

- 默认心跳周期：**15 秒**
- 若 `now - last_heartbeat_ts > 45 秒`，判定为 **offline**
- 状态切换（online↔offline）写入 `events`

---

## 7) 性能与稳定性目标（V1）

- 节点规模目标：**5~20 节点**
- Dashboard 首屏查询：< 1 秒（本地网络）
- WS 推送延迟：常态 < 1 秒
- 日志分页：万级事件可正常翻页

---

## 8) 安全最小基线（V1）

- Agent 上报必须携带 token
- token 不回显在日志里（仅显示前后掩码）
- API 输入做基本类型校验
- 默认绑定内网；公网部署由反代与防火墙控制

---

## 9) 验收标准（Step 0）

Step 0 视为完成需满足：

- [x] V1 目标明确
- [x] 非目标明确
- [x] 数据字段冻结
- [x] API 边界冻结
- [x] 在线判定规则冻结

---

## 10) 下一步（Step 1）

按冻结范围创建项目骨架（server/agent/web/scripts/docs），仅搭目录与启动说明，不写业务逻辑。
