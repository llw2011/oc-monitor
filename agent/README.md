# OC-Monitor Agent

## 快速运行

```bash
python3 agent.py --server http://127.0.0.1:3800 --name node-a --interval 15
```

## 一键安装

```bash
bash install-agent.sh -s http://127.0.0.1:3800 -n "node-a" -i 15
```

## 特性

- 首次自动注册（拿到 token 后保存在 `~/.oc-monitor-agent/state.json`）
- 定时心跳上报（默认 15 秒）
- 上报失败指数退避重试（最大 60 秒）
- 401 自动重注册
