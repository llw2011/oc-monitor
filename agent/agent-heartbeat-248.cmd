@echo off
REM Template heartbeat sample (replace YOUR_AGENT_TOKEN before use)
curl.exe -s -X POST http://127.0.0.1:3888/api/agent/heartbeat -H "Authorization: Bearer YOUR_AGENT_TOKEN" -H "Content-Type: application/json" -d "{\"cpu_percent\":1,\"mem_used_bytes\":1,\"mem_total_bytes\":1,\"disk_used_bytes\":1,\"disk_total_bytes\":1}" >nul 2>&1
