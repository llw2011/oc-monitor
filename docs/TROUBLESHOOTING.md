# OC-Monitor V1 故障排查

## 1) Server 启动失败

### 现象
- `scripts/install.sh` 报 health check failed

### 检查
```bash
cat ~/.oc-monitor/logs/server.out | tail -n 100
lsof -i :3800
```

### 处理
- 端口冲突：改端口后重启
- 依赖未装：进入 `server/` 重新 `npm install`

---

## 2) Agent 一直不上线

### 检查
```bash
cat ~/.oc-monitor-agent/state.json
cat /tmp/oc-monitor-agent.log | tail -n 100
curl -I http://<SERVER_IP>:3800/healthz
```

### 处理
- Server 地址错误（常见）
- 节点网络无法访问 3800
- token 失效会自动重注册，若失败可删 `state.json` 重装

---

## 3) WS 不实时刷新

### 检查
- 浏览器控制台是否有 `/ws` 连接错误
- 反代是否支持 WebSocket Upgrade

### 处理
- Nginx/Caddy 需开启 Upgrade 头透传
- 临时验证可直连 `http://SERVER:3800/`

---

## 4) 日志过大

### 建议
- 先保留 V1 默认行为（完整日志）
- 若后续变大，V2 增加日志保留策略（按天归档/清理）
