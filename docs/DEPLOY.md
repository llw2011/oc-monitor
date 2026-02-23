# OC-Monitor V1 部署文档

## 1. Server 部署

```bash
cd oc-monitor
bash scripts/install.sh
```

默认：
- 监听：`0.0.0.0:3800`
- 数据库：`~/.oc-monitor/monitor.db`
- 日志：`~/.oc-monitor/logs/server.out`

检查状态：
```bash
bash scripts/status.sh
```

停止服务：
```bash
bash scripts/uninstall.sh
```

---

## 2. Agent 部署（每个节点）

把 `oc-monitor/agent/` 目录同步到节点后执行：

```bash
cd agent
bash install-agent.sh -s http://<SERVER_IP>:3800 -n "<节点名>" -i 15
```

参数说明：
- `-s` Server 地址（必填）
- `-n` 节点名称（可选）
- `-i` 心跳间隔秒（可选，默认 15）

Agent 状态文件：
- `~/.oc-monitor-agent/state.json`

---

## 3. Dashboard 访问

- `http://<SERVER_IP>:3800/`

页面包含：
- 节点总览
- 实时事件流
- 日志分页

---

## 4. 升级步骤

Server 升级：
```bash
cd oc-monitor
bash scripts/install.sh
```

Agent 升级：
```bash
cd agent
bash install-agent.sh -s http://<SERVER_IP>:3800 -n "<节点名>" -i 15
```

---

## 5. 最小验证清单

- [ ] `scripts/status.sh` 显示 running
- [ ] `curl http://127.0.0.1:3800/healthz` 返回 `ok:true`
- [ ] Dashboard 能看到节点 online/offline
- [ ] 日志分页能翻页
