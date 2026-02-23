# OC-Monitor 部署速览

> 快速版，详细请看：`INSTALL_FULL_ZH.md`

## Server（Linux）

```bash
cd oc-monitor
bash scripts/install.sh
```

默认读取：

- `.env`
- `.env.local`（覆盖）

默认端口：`3888`

## Agent（Linux）

```bash
cd oc-monitor/agent
bash install-agent.sh -s http://<SERVER_IP>:3888 -n "node-01" -i 15
```

## Agent（Windows）

```powershell
cd .\oc-monitor\agent
.\install-agent-win.ps1 -Server "http://<SERVER_IP>:3888" -NodeName "win-node-01" -Interval 15
```

## 健康检查

```bash
curl http://127.0.0.1:3888/healthz
```

## 升级

```bash
cd oc-monitor
bash scripts/install.sh
```

## 卸载（仅停止服务）

```bash
bash scripts/uninstall.sh
```
