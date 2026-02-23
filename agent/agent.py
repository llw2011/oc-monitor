#!/usr/bin/env python3
import argparse
import json
import os
import platform
import socket
import subprocess
import time
import urllib.request
import urllib.error

STATE_PATH_DEFAULT = os.path.expanduser("~/.oc-monitor-agent/state.json")


def now_sec():
    return int(time.time())


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)


def read_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def write_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def post_json(url, body, token=None, timeout=8):
    data = json.dumps(body).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def shell(cmd):
    try:
        return subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ""


def get_mem_info():
    info = {}
    try:
        with open("/proc/meminfo", "r", encoding="utf-8") as f:
            for line in f:
                k, v = line.split(":", 1)
                info[k.strip()] = int(v.strip().split()[0]) * 1024
        total = info.get("MemTotal", 0)
        avail = info.get("MemAvailable", info.get("MemFree", 0))
        swap_total = info.get("SwapTotal", 0)
        swap_free = info.get("SwapFree", 0)
        return {
            "mem_total_bytes": total,
            "mem_used_bytes": max(total - avail, 0),
            "swap_total_bytes": swap_total,
            "swap_used_bytes": max(swap_total - swap_free, 0),
        }
    except Exception:
        return {
            "mem_total_bytes": None,
            "mem_used_bytes": None,
            "swap_total_bytes": None,
            "swap_used_bytes": None,
        }


def get_disk_info(path="/"):
    try:
        st = os.statvfs(path)
        total = st.f_blocks * st.f_frsize
        free = st.f_bavail * st.f_frsize
        return {
            "disk_total_bytes": total,
            "disk_used_bytes": max(total - free, 0),
        }
    except Exception:
        return {
            "disk_total_bytes": None,
            "disk_used_bytes": None,
        }


def get_cpu_percent(interval=0.2):
    def read_cpu():
        with open("/proc/stat", "r", encoding="utf-8") as f:
            parts = f.readline().split()[1:]
            vals = list(map(int, parts))
            idle = vals[3] + vals[4] if len(vals) > 4 else vals[3]
            total = sum(vals)
            return idle, total
    try:
        idle1, total1 = read_cpu()
        time.sleep(interval)
        idle2, total2 = read_cpu()
        didle = idle2 - idle1
        dtotal = total2 - total1
        if dtotal <= 0:
            return None
        return round((1 - didle / dtotal) * 100, 2)
    except Exception:
        return None


def collect_metrics():
    mem = get_mem_info()
    disk = get_disk_info("/")
    load = os.getloadavg()[0] if hasattr(os, "getloadavg") else None
    uptime = None
    try:
        with open("/proc/uptime", "r", encoding="utf-8") as f:
            uptime = int(float(f.read().split()[0]))
    except Exception:
        pass
    return {
        "cpu_percent": get_cpu_percent(),
        **mem,
        **disk,
        "uptime_sec": uptime,
        "load_1m": round(load, 2) if isinstance(load, (float, int)) else None,
    }


def register_if_needed(server, state, name):
    if state.get("token") and state.get("agent_id"):
        return state
    body = {
        "name": name,
        "hostname": socket.gethostname(),
        "ip": shell("hostname -I | awk '{print $1}'") or "127.0.0.1",
        "os": f"{platform.system()} {platform.release()}".strip(),
    }
    res = post_json(f"{server}/api/agent/register", body)
    state["agent_id"] = res["agent_id"]
    state["token"] = res["token"]
    state["registered_at"] = now_sec()
    return state


def send_heartbeat(server, token):
    metrics = collect_metrics()
    return post_json(f"{server}/api/agent/heartbeat", metrics, token=token)


def run_loop(server, state_path, name, interval, max_backoff):
    ensure_dir(os.path.dirname(state_path))
    state = read_json(state_path, {})
    state = register_if_needed(server, state, name)
    write_json(state_path, state)

    backoff = 1
    while True:
        try:
            send_heartbeat(server, state["token"])
            state["last_ok_ts"] = now_sec()
            write_json(state_path, state)
            backoff = 1
            time.sleep(interval)
        except urllib.error.HTTPError as e:
            if e.code == 401:
                # token invalid, re-register once
                state = {}
                state = register_if_needed(server, state, name)
                write_json(state_path, state)
            else:
                time.sleep(min(backoff, max_backoff))
                backoff = min(backoff * 2, max_backoff)
        except Exception:
            time.sleep(min(backoff, max_backoff))
            backoff = min(backoff * 2, max_backoff)


def main():
    p = argparse.ArgumentParser(description="OC-Monitor Agent")
    p.add_argument("--server", required=True, help="Server base URL, e.g. http://1.2.3.4:3800")
    p.add_argument("--name", default=socket.gethostname(), help="Node display name")
    p.add_argument("--interval", type=int, default=15, help="Heartbeat interval seconds")
    p.add_argument("--state", default=STATE_PATH_DEFAULT, help="State file path")
    p.add_argument("--max-backoff", type=int, default=60, help="Max retry backoff seconds")
    args = p.parse_args()

    server = args.server.rstrip("/")
    run_loop(server, args.state, args.name, args.interval, args.max_backoff)


if __name__ == "__main__":
    main()
