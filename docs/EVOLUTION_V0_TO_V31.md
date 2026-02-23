# OC-Monitor 演进记录（V0 → V2.5 + V3-1 base）

## V0（起点）

- 目标：从 0 搭出最小可运行监控系统
- 核心：Node + SQLite + 简单前端

## V1（可用基线）

- Server API + SQLite 数据存储
- Agent 注册与心跳
- Dashboard 基础展示（节点/日志）
- 一键安装脚本

## V2（体验强化）

- UI 升级（Mission Control 风格）
- 脱敏/完整视图
- Token 解锁
- Admin 登录与会话
- 主题切换

## V2.5（稳态化）

### P0 UI 收尾
- 顶部冗余信息精简
- 状态胶囊与 toast 提示
- 登录/Token 弹窗重做

### P1 告警中心
- 离线/心跳延迟/CPU高/内存高/磁盘高

### P2 审计
- admin 登录/退出记录
- CSV 导出

### P3 数据留存
- events/heartbeats TTL
- 定时清理

### P4 健康总览
- 一屏展示 server/ws/nodes/db/provider/retention

### P5 告警操作
- ACK
- 静默 30m

## V3-1 base（通知能力起步）

- Critical 告警通知引擎
- 防抖间隔（默认 300s）
- 仅 actionable critical 才推送
- 通知状态落库（last_notified_at）
- 默认关闭，按需在 `.env` 开启

---

## 当前版本定位

- ✅ 可单机部署
- ✅ 可多节点扩展
- ✅ 可分享部署（配置外置）
- ✅ 中文用户友好文档

下阶段建议：
- Webhook/多渠道通知
- RBAC 权限细化
- 告警升级策略（分级、抑制、聚合）
