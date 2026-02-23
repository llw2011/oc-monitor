# OC-Monitor 完整安装与部署指南（中文）

> 面向：第一次接触 OC-Monitor 的用户（含中文用户）
> 
> 目标：从 0 到可用，含 Server 一键安装、Agent 一键安装、常见问题排查。

---

## 0. 你将获得什么

安装完成后你会有：

- 一个监控面板（网页）
- 多节点在线状态
- 告警中心（离线/高负载）
- 审计、留存、健康总览
- 可选 Telegram 告警推送（默认关闭）

---

## 1. 环境准备

### Linux Server（推荐）

- Node.js 18+（建议 20/22）
- npm
- curl

检查命令：

```bash
node -v
npm -v
curl --version
```

---

## 2. 一键安装 Server（Linux）

进入项目目录：

```bash
cd oc-monitor
bash scripts/install.sh
```

这个脚本会自动做：

1. 安装 server 依赖
2. 自动生成运行凭据（dashboard token / admin pass / session secret）
3. 启动服务
4. 健康检查

完成后你会看到：

- Dashboard 地址
- Dashboard Token
- Admin 账号密码

> 注意：请妥善保存输出的 token/password。

---

## 3. 配置文件（推荐方式）

复制模板：

```bash
cp .env.example .env
```

按需编辑 `.env`，常用项：

```env
PORT=3888
DASHBOARD_TOKEN=your_dashboard_token
ADMIN_USER=admin
ADMIN_PASS=your_admin_password
SESSION_SECRET=your_session_secret
```

如需本机覆盖，不改共享文件：

- 新建 `.env.local`（优先级更高）

---

## 4. 访问面板

浏览器打开：

```text
http://<你的服务器IP>:3888/
```

如果你设置了 `DASHBOARD_TOKEN`，在页面右上角点击 🔒 输入 token 解锁完整视图。

---

## 5. 一键安装 Agent（Linux 节点）

在每台被监控机器上执行：

```bash
cd oc-monitor/agent
bash install-agent.sh -s http://<SERVER_IP>:3888 -n "node-01" -i 15
```

参数说明：

- `-s`：Server 地址（必填）
- `-n`：节点名（可选，默认主机名）
- `-i`：上报间隔秒（默认 15）

安装后：

- 优先注册为 `systemd --user` 服务
- 否则后台运行

状态文件：

```text
~/.oc-monitor-agent/state.json
```

---

## 6. 一键安装 Agent（Windows 节点）

在 Windows PowerShell（管理员）中：

```powershell
cd .\oc-monitor\agent
.\install-agent-win.ps1 -Server "http://<SERVER_IP>:3888" -NodeName "win-node-01" -Interval 15
```

脚本会创建计划任务：

- 任务名默认：`OC-Monitor-Agent`
- 开机自动启动

---

## 7. V3-1 告警通知（可选）

默认关闭，开启方式（`.env`）：

```env
ALERT_NOTIFY_ENABLED=1
ALERT_NOTIFY_MIN_INTERVAL_SEC=300
TELEGRAM_BOT_TOKEN=<your_bot_token>
TELEGRAM_CHAT_ID=<your_chat_id>
```

重启服务：

```bash
bash scripts/install.sh
```

---

## 8. 常用运维命令

```bash
# 查看状态
bash scripts/status.sh

# 升级/重装（保留 runtime）
bash scripts/install.sh

# 卸载 server 进程（保留数据）
bash scripts/uninstall.sh
```

---

## 9. 验收清单（建议）

- [ ] `curl http://127.0.0.1:3888/healthz` 返回 `ok:true`
- [ ] Dashboard 可打开
- [ ] 至少 1 个节点显示 online
- [ ] 告警中心可见
- [ ] 健康总览有数据
- [ ] （可选）审计页可见登录记录

---

## 10. 安全建议（必须看）

1. 不要提交 `.env` / `.env.local`
2. 不要在公开日志中贴 token/password
3. 生产环境请改默认端口、密码、session secret
4. 如暴露公网，务必加反向代理与 HTTPS

---

## 11. FAQ（高频）

### Q1：页面打开了但没节点？
- 先检查 Agent 是否成功安装
- 检查 Agent 的 `-s` 地址是否能连到 Server

### Q2：Token 输入后仍脱敏？
- 确认 token 与服务端一致
- 强制刷新浏览器（Ctrl+F5）

### Q3：告警太频繁？
- 提高 `ALERT_NOTIFY_MIN_INTERVAL_SEC`
- 使用告警 ACK 或静默（30m）

---

如果你是第一次部署，严格照本页走，5-10 分钟可跑通。
