import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer } from 'ws';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function loadEnvFiles() {
  const candidates = [
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '../.env.local'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith('#')) continue;
      const i = s.indexOf('=');
      if (i <= 0) continue;
      const k = s.slice(0, i).trim();
      const v = s.slice(i + 1).trim().replace(/^"|"$/g, '');
      if (!(k in process.env)) process.env[k] = v;
    }
  }
}
loadEnvFiles();

const PORT = Number(process.env.PORT || 3800);
const DB_PATH = process.env.DB_PATH || './monitor.db';
const OFFLINE_TIMEOUT_SEC = Number(process.env.OFFLINE_TIMEOUT_SEC || 45);
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || '';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.DASHBOARD_TOKEN || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(16).toString('hex');
const SESSION_TTL_SEC = Number(process.env.SESSION_TTL_SEC || 86400);
const ALERT_CPU_HIGH = Number(process.env.ALERT_CPU_HIGH || 90);
const ALERT_MEM_HIGH = Number(process.env.ALERT_MEM_HIGH || 90);
const ALERT_DISK_HIGH = Number(process.env.ALERT_DISK_HIGH || 90);
const ALERT_STALE_SEC = Number(process.env.ALERT_STALE_SEC || Math.max(OFFLINE_TIMEOUT_SEC + 15, 60));
const RETENTION_EVENTS_DAYS = Number(process.env.RETENTION_EVENTS_DAYS || 30);
const RETENTION_HEARTBEATS_DAYS = Number(process.env.RETENTION_HEARTBEATS_DAYS || 14);
const ALERT_NOTIFY_ENABLED = String(process.env.ALERT_NOTIFY_ENABLED || '0') === '1';
const ALERT_NOTIFY_MIN_INTERVAL_SEC = Number(process.env.ALERT_NOTIFY_MIN_INTERVAL_SEC || 300);
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const TELEGRAM_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || '').trim();

const db = new DatabaseSync(DB_PATH);
db.exec(`
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  hostname TEXT,
  ip TEXT,
  os TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS heartbeats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  cpu_percent REAL,
  mem_used_bytes INTEGER,
  mem_total_bytes INTEGER,
  disk_used_bytes INTEGER,
  disk_total_bytes INTEGER,
  swap_used_bytes INTEGER,
  swap_total_bytes INTEGER,
  uptime_sec INTEGER,
  load_1m REAL
);
CREATE INDEX IF NOT EXISTS idx_heartbeats_agent_ts ON heartbeats(agent_id, ts DESC);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  agent_id TEXT,
  level TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  meta_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_id);
CREATE TABLE IF NOT EXISTS alert_state (
  alert_id TEXT PRIMARY KEY,
  acked INTEGER NOT NULL DEFAULT 0,
  acked_at INTEGER,
  acked_by TEXT,
  silence_until INTEGER,
  last_notified_at INTEGER,
  updated_at INTEGER NOT NULL
);
`);

// lightweight migration for older db
try { db.prepare(`ALTER TABLE alert_state ADD COLUMN last_notified_at INTEGER`).run(); } catch {}


const nowSec = () => Math.floor(Date.now() / 1000);
const SERVER_STARTED_AT = nowSec();
const makeId = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const safeNum = (v, d = null) => (v === undefined || v === null || v === '' ? d : (Number.isFinite(Number(v)) ? Number(v) : d));
const qRun = (sql, ...args) => db.prepare(sql).run(...args);
const qGet = (sql, ...args) => db.prepare(sql).get(...args);
const qAll = (sql, ...args) => db.prepare(sql).all(...args);

const PROVIDER_TARGETS = (() => {
  const raw = String(process.env.PROVIDER_TARGETS || '').trim();
  if (!raw) {
    return {
      lmstudio7b: 'http://192.168.10.248:8085/v1/models',
      lmstudio3b: 'http://192.168.10.248:8088/v1/models',
      ollama: 'http://192.168.10.248:11438/v1/models',
    };
  }
  if (raw.startsWith('{')) {
    try {
      const obj = JSON.parse(raw);
      return Object.fromEntries(Object.entries(obj).filter(([, v]) => typeof v === 'string' && v.trim()));
    } catch {
      return {};
    }
  }
  // fallback: name=url;name2=url2
  const out = {};
  for (const item of raw.split(';')) {
    const i = item.indexOf('=');
    if (i <= 0) continue;
    const k = item.slice(0, i).trim();
    const v = item.slice(i + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
})();
const PROVIDERS = Object.keys(PROVIDER_TARGETS);

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1024 * 1024) reject(new Error('Payload too large')); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

function authAgent(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  const token = h.slice(7).trim();
  if (!token) return null;
  return qGet(`SELECT * FROM agents WHERE token = ? AND enabled = 1 LIMIT 1`, token) || null;
}

function clientInfo(req) {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';
  return { ip: String(ip), ua: String(ua) };
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function signSession(payloadBase64) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payloadBase64).digest('hex');
}

function makeSession(user) {
  const payload = { u: user, exp: nowSec() + SESSION_TTL_SEC };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = signSession(b64);
  return `${b64}.${sig}`;
}

function verifySession(token) {
  if (!token || !token.includes('.')) return null;
  const [b64, sig] = token.split('.', 2);
  if (!b64 || !sig) return null;
  if (signSession(b64) !== sig) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf-8'));
    if (!payload?.u || !payload?.exp) return null;
    if (nowSec() > Number(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

function isAdminSession(req) {
  const c = parseCookies(req);
  const s = c.ocm_session;
  return verifySession(s);
}

function getDashboardToken(req, u) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const x = req.headers['x-dashboard-token'];
  if (typeof x === 'string' && x.trim()) return x.trim();
  const q = u.searchParams.get('token');
  if (q) return q.trim();
  return '';
}

function isFullView(req, u) {
  if (isAdminSession(req)) return true;
  if (!DASHBOARD_TOKEN) return true;
  return getDashboardToken(req, u) === DASHBOARD_TOKEN;
}

function maskIp(ip) {
  if (!ip) return '-';
  const parts = String(ip).split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  return '***';
}

function maskHost(hostname) {
  if (!hostname) return '-';
  const s = String(hostname);
  if (s.length <= 3) return `${s[0]}**`;
  return `${s.slice(0, 2)}***${s.slice(-1)}`;
}

function maskName(name) {
  if (!name) return '-';
  const s = String(name);
  if (s.length <= 2) return `${s[0]}*`;
  return `${s.slice(0, 1)}***${s.slice(-1)}`;
}

function hashNum(s) {
  const h = crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
  return parseInt(h, 16);
}

async function probeProviders() {
  const out = {};
  for (const [name, url] of Object.entries(PROVIDER_TARGETS)) {
    const start = Date.now();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      const resp = await fetch(url, { method: 'GET', signal: ctrl.signal });
      clearTimeout(t);
      out[name] = { healthy: resp.ok, latency_ms: Date.now() - start, status: resp.status };
    } catch {
      out[name] = { healthy: false, latency_ms: null, status: null };
    }
  }
  return out;
}

async function providerMatrix(nodes) {
  const probes = await probeProviders();
  return nodes.map((n) => ({
    agent_id: n.agent_id,
    name: n.name,
    online: n.online,
    providers: PROVIDERS.map((p) => {
      const pr = probes[p] || { healthy: false, latency_ms: null };
      return { provider: p, healthy: n.online ? pr.healthy : false, latency_ms: n.online ? pr.latency_ms : null };
    }),
  }));
}

function getNodesSnapshot(full = true) {
  const agents = qAll(`SELECT * FROM agents WHERE enabled = 1`);
  const latest = qAll(`
    SELECT h.* FROM heartbeats h
    INNER JOIN (
      SELECT agent_id, MAX(ts) AS max_ts FROM heartbeats GROUP BY agent_id
    ) m ON h.agent_id = m.agent_id AND h.ts = m.max_ts
  `);
  const map = new Map(latest.map((x) => [x.agent_id, x]));
  const now = nowSec();

  const rawNodes = agents.map((a) => {
    const hb = map.get(a.id);
    const lastTs = hb?.ts || a.updated_at || a.created_at;
    const online = now - lastTs <= OFFLINE_TIMEOUT_SEC;
    return {
      agent_id: a.id,
      name: a.name,
      hostname: a.hostname,
      ip: a.ip,
      os: a.os,
      last_heartbeat_ts: lastTs,
      online,
      metrics: hb ? {
        cpu_percent: hb.cpu_percent,
        mem_used_bytes: hb.mem_used_bytes,
        mem_total_bytes: hb.mem_total_bytes,
        disk_used_bytes: hb.disk_used_bytes,
        disk_total_bytes: hb.disk_total_bytes,
        swap_used_bytes: hb.swap_used_bytes,
        swap_total_bytes: hb.swap_total_bytes,
        uptime_sec: hb.uptime_sec,
        load_1m: hb.load_1m,
      } : null,
    };
  });

  // 合并重复主机：同 IP 归并为一个展示卡片（避免 host+container 重复）
  const groups = new Map();
  for (const n of rawNodes) {
    const key = (n.ip && n.ip !== '-' ? `ip:${n.ip}` : `host:${n.hostname || n.agent_id}`);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }

  const merged = [];
  for (const [, arr] of groups) {
    arr.sort((a, b) => {
      const am = a.metrics?.mem_total_bytes || 0;
      const bm = b.metrics?.mem_total_bytes || 0;
      if (bm !== am) return bm - am; // 更完整采集优先
      return (b.last_heartbeat_ts || 0) - (a.last_heartbeat_ts || 0);
    });
    const p = arr[0];
    merged.push({
      ...p,
      online: arr.some((x) => x.online),
      merged_agents: arr.length,
      merged_names: arr.map((x) => x.name).filter(Boolean),
    });
  }

  const nodes = merged.map((n) => ({
    ...n,
    name: full ? n.name : maskName(n.name),
    hostname: full ? n.hostname : maskHost(n.hostname),
    ip: full ? n.ip : maskIp(n.ip),
  }));

  return { nodes, ts: now, masked: !full };
}

function getAlertStateMap() {
  const rows = qAll(`SELECT * FROM alert_state`);
  const m = new Map();
  for (const r of rows) m.set(r.alert_id, r);
  return m;
}

function upsertAlertState(alertId, patch = {}) {
  const ts = nowSec();
  const prev = qGet(`SELECT * FROM alert_state WHERE alert_id=?`, alertId) || {};
  const next = {
    acked: patch.acked ?? prev.acked ?? 0,
    acked_at: patch.acked_at ?? prev.acked_at ?? null,
    acked_by: patch.acked_by ?? prev.acked_by ?? null,
    silence_until: patch.silence_until ?? prev.silence_until ?? null,
    last_notified_at: patch.last_notified_at ?? prev.last_notified_at ?? null,
    updated_at: ts,
  };
  qRun(`INSERT INTO alert_state(alert_id, acked, acked_at, acked_by, silence_until, last_notified_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(alert_id) DO UPDATE SET
          acked=excluded.acked,
          acked_at=excluded.acked_at,
          acked_by=excluded.acked_by,
          silence_until=excluded.silence_until,
          last_notified_at=excluded.last_notified_at,
          updated_at=excluded.updated_at`,
    alertId, next.acked, next.acked_at, next.acked_by, next.silence_until, next.last_notified_at, next.updated_at);
}

async function sendTelegramAlert(text) {
  if (!ALERT_NOTIFY_ENABLED) return { ok: false, reason: 'notify_disabled' };
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return { ok: false, reason: 'telegram_not_configured' };
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    });
    return { ok: resp.ok, status: resp.status };
  } catch (e) {
    return { ok: false, reason: e?.message || 'send_failed' };
  }
}

async function runAlertNotifierOnce() {
  const now = nowSec();
  const d = computeAlerts(true);
  const targets = (d.items || []).filter((a) => a.severity === 'critical' && a.actionable);
  for (const a of targets) {
    const st = qGet(`SELECT * FROM alert_state WHERE alert_id=?`, a.id) || {};
    const last = Number(st.last_notified_at || 0);
    if (last > 0 && now - last < ALERT_NOTIFY_MIN_INTERVAL_SEC) continue;
    const text = [
      '🚨 OC-Monitor Critical Alert',
      `Node: ${a.node || a.agent_id || '-'}`,
      `Type: ${a.type}`,
      `Message: ${a.message}`,
      `Value/Threshold: ${a.value ?? '-'} / ${a.threshold ?? '-'}`,
      `Time: ${new Date(now * 1000).toISOString()}`,
    ].join('\n');
    const r = await sendTelegramAlert(text);
    if (r.ok) {
      upsertAlertState(a.id, { last_notified_at: now });
      qRun(`INSERT INTO events(ts, agent_id, level, type, message, meta_json) VALUES (?, ?, ?, ?, ?, ?)`, now, a.agent_id || null, 'warn', 'alert_notified', `telegram notified: ${a.id}`, JSON.stringify({ status: r.status || 200 }));
    } else {
      qRun(`INSERT INTO events(ts, agent_id, level, type, message, meta_json) VALUES (?, ?, ?, ?, ?, ?)`, now, a.agent_id || null, 'warn', 'alert_notify_failed', `telegram notify failed: ${a.id}`, JSON.stringify(r));
    }
  }
}

function runRetentionCleanup() {
  const ts = nowSec();
  const evBefore = ts - Math.max(1, RETENTION_EVENTS_DAYS) * 86400;
  const hbBefore = ts - Math.max(1, RETENTION_HEARTBEATS_DAYS) * 86400;
  const r1 = qRun(`DELETE FROM events WHERE ts < ?`, evBefore);
  const r2 = qRun(`DELETE FROM heartbeats WHERE ts < ?`, hbBefore);
  if ((r1.changes || 0) > 0 || (r2.changes || 0) > 0) {
    qRun(`INSERT INTO events(ts, agent_id, level, type, message, meta_json) VALUES (?, ?, ?, ?, ?, ?)`,
      ts, null, 'info', 'retention_cleanup', `retention cleanup done`, JSON.stringify({ events_deleted: r1.changes || 0, heartbeats_deleted: r2.changes || 0, retention_events_days: RETENTION_EVENTS_DAYS, retention_heartbeats_days: RETENTION_HEARTBEATS_DAYS }));
  }
  return { ts, events_deleted: r1.changes || 0, heartbeats_deleted: r2.changes || 0, retention_events_days: RETENTION_EVENTS_DAYS, retention_heartbeats_days: RETENTION_HEARTBEATS_DAYS };
}

async function computeSystemHealth(full = true) {
  const ts = nowSec();
  const nodesSnap = getNodesSnapshot(full);
  const providers = await probeProviders();
  const online = nodesSnap.nodes.filter((n) => n.online).length;
  const evCount = qGet(`SELECT COUNT(1) AS cnt FROM events`).cnt;
  const hbCount = qGet(`SELECT COUNT(1) AS cnt FROM heartbeats`).cnt;
  const lastCleanup = qGet(`SELECT ts, meta_json FROM events WHERE type='retention_cleanup' ORDER BY ts DESC LIMIT 1`) || null;
  return {
    ok: true,
    ts,
    uptime_sec: Math.max(0, ts - SERVER_STARTED_AT),
    ws_clients: clients.size,
    nodes: { total: nodesSnap.nodes.length, online, offline: Math.max(0, nodesSnap.nodes.length - online) },
    database: { path: DB_PATH, events: evCount, heartbeats: hbCount },
    retention: {
      events_days: RETENTION_EVENTS_DAYS,
      heartbeats_days: RETENTION_HEARTBEATS_DAYS,
      last_cleanup_ts: lastCleanup?.ts || null,
    },
    providers,
  };
}

function computeAlerts(full = true) {
  const snap = getNodesSnapshot(full);
  const now = nowSec();
  const states = getAlertStateMap();
  const alerts = [];
  for (const n of snap.nodes) {
    const m = n.metrics || {};
    const memPct = m.mem_total_bytes ? (Number(m.mem_used_bytes || 0) / Number(m.mem_total_bytes)) * 100 : 0;
    const diskPct = m.disk_total_bytes ? (Number(m.disk_used_bytes || 0) / Number(m.disk_total_bytes)) * 100 : 0;
    const staleSec = Math.max(0, now - Number(n.last_heartbeat_ts || 0));

    if (!n.online) {
      alerts.push({ id: `${n.agent_id}:offline`, ts: now, severity: 'critical', type: 'offline', agent_id: n.agent_id, node: n.name, message: '节点离线（心跳超时）', value: staleSec, threshold: OFFLINE_TIMEOUT_SEC });
    } else if (staleSec >= ALERT_STALE_SEC) {
      alerts.push({ id: `${n.agent_id}:stale`, ts: now, severity: 'warn', type: 'stale', agent_id: n.agent_id, node: n.name, message: '节点心跳延迟', value: staleSec, threshold: ALERT_STALE_SEC });
    }

    if (Number(m.cpu_percent || 0) >= ALERT_CPU_HIGH) {
      alerts.push({ id: `${n.agent_id}:cpu`, ts: now, severity: 'warn', type: 'cpu_high', agent_id: n.agent_id, node: n.name, message: 'CPU 使用率过高', value: Number(m.cpu_percent || 0), threshold: ALERT_CPU_HIGH });
    }
    if (memPct >= ALERT_MEM_HIGH) {
      alerts.push({ id: `${n.agent_id}:mem`, ts: now, severity: 'warn', type: 'mem_high', agent_id: n.agent_id, node: n.name, message: '内存使用率过高', value: Number(memPct.toFixed(1)), threshold: ALERT_MEM_HIGH });
    }
    if (diskPct >= ALERT_DISK_HIGH) {
      alerts.push({ id: `${n.agent_id}:disk`, ts: now, severity: 'warn', type: 'disk_high', agent_id: n.agent_id, node: n.name, message: '磁盘使用率过高', value: Number(diskPct.toFixed(1)), threshold: ALERT_DISK_HIGH });
    }
  }
  const enriched = alerts.map((a) => {
    const st = states.get(a.id) || {};
    const silenced = st.silence_until ? now < Number(st.silence_until) : false;
    return {
      ...a,
      acked: !!st.acked,
      acked_at: st.acked_at || null,
      acked_by: st.acked_by || null,
      silence_until: st.silence_until || null,
      silenced,
      actionable: !silenced && !st.acked,
    };
  });
  enriched.sort((a, b) => (a.severity === 'critical' ? -1 : 0) - (b.severity === 'critical' ? -1 : 0));
  return {
    ts: snap.ts,
    masked: snap.masked,
    total: enriched.length,
    critical: enriched.filter((x) => x.severity === 'critical').length,
    warn: enriched.filter((x) => x.severity === 'warn').length,
    actionable_critical: enriched.filter((x) => x.severity === 'critical' && x.actionable).length,
    thresholds: { cpu_high: ALERT_CPU_HIGH, mem_high: ALERT_MEM_HIGH, disk_high: ALERT_DISK_HIGH, stale_sec: ALERT_STALE_SEC, offline_sec: OFFLINE_TIMEOUT_SEC },
    items: enriched,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host}`);
    const full = isFullView(req, u);

    if (req.method === 'GET' && u.pathname === '/healthz') return json(res, 200, { ok: true, ts: nowSec() });

    if (req.method === 'GET' && u.pathname === '/api/auth/check') {
      return json(res, 200, { ok: true, full, token_required: !!DASHBOARD_TOKEN, admin_logged_in: !!isAdminSession(req) });
    }

    if (req.method === 'GET' && u.pathname === '/api/admin/me') {
      const s = isAdminSession(req);
      return json(res, 200, { ok: true, logged_in: !!s, user: s?.u || null });
    }

    if (req.method === 'POST' && u.pathname === '/api/admin/login') {
      const body = await parseBody(req);
      if (!ADMIN_PASS) return json(res, 503, { error: 'admin login not configured' });
      if (String(body.username || '') !== ADMIN_USER || String(body.password || '') !== ADMIN_PASS) {
        return json(res, 401, { error: 'invalid credentials' });
      }
      const session = makeSession(ADMIN_USER);
      const ts = nowSec();
      const ci = clientInfo(req);
      qRun(`INSERT INTO events(ts, agent_id, level, type, message, meta_json) VALUES (?, ?, ?, ?, ?, ?)`,
        ts, null, 'info', 'admin_login', `admin login: ${ADMIN_USER}`, JSON.stringify(ci));
      res.setHeader('Set-Cookie', `ocm_session=${encodeURIComponent(session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}`);
      return json(res, 200, { ok: true, user: ADMIN_USER });
    }

    if (req.method === 'POST' && u.pathname === '/api/admin/logout') {
      const ts = nowSec();
      const ci = clientInfo(req);
      qRun(`INSERT INTO events(ts, agent_id, level, type, message, meta_json) VALUES (?, ?, ?, ?, ?, ?)`,
        ts, null, 'info', 'admin_logout', 'admin logout', JSON.stringify(ci));
      res.setHeader('Set-Cookie', 'ocm_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && u.pathname === '/api/auth/debug') {
      const provided = getDashboardToken(req, u);
      const h = (s) => crypto.createHash('sha1').update(s || '').digest('hex').slice(0, 10);
      return json(res, 200, { required: !!DASHBOARD_TOKEN, server_len: DASHBOARD_TOKEN.length, provided_len: provided.length, server_h: h(DASHBOARD_TOKEN), provided_h: h(provided) });
    }

    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) {
      const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    if (req.method === 'POST' && u.pathname === '/api/agent/register') {
      const body = await parseBody(req);
      for (const f of ['name', 'hostname', 'ip', 'os']) if (!body[f]) return json(res, 400, { error: `missing field: ${f}` });
      const ts = nowSec();
      const agentId = makeId('agent');
      const token = makeId('ocm');
      qRun(`INSERT INTO agents(id, token, name, hostname, ip, os, created_at, updated_at, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        agentId, token, String(body.name), String(body.hostname), String(body.ip), String(body.os), ts, ts);
      qRun(`INSERT INTO events(ts, agent_id, level, type, message, meta_json) VALUES (?, ?, ?, ?, ?, ?)`,
        ts, agentId, 'info', 'register', `agent registered: ${body.name}`, null);
      broadcast({ type: 'event:new', data: { ts, agent_id: agentId, level: 'info', event_type: 'register', message: `agent registered: ${body.name}` } });
      broadcastNodeUpdate();
      return json(res, 200, { agent_id: agentId, token });
    }

    if (req.method === 'POST' && u.pathname === '/api/agent/heartbeat') {
      const agent = authAgent(req);
      if (!agent) return json(res, 401, { error: 'unauthorized' });
      const body = await parseBody(req);
      const ts = nowSec();
      qRun(`INSERT INTO heartbeats(agent_id, ts, cpu_percent, mem_used_bytes, mem_total_bytes, disk_used_bytes, disk_total_bytes, swap_used_bytes, swap_total_bytes, uptime_sec, load_1m)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        agent.id, ts,
        safeNum(body.cpu_percent), safeNum(body.mem_used_bytes), safeNum(body.mem_total_bytes),
        safeNum(body.disk_used_bytes), safeNum(body.disk_total_bytes), safeNum(body.swap_used_bytes),
        safeNum(body.swap_total_bytes), safeNum(body.uptime_sec), safeNum(body.load_1m));
      qRun(`UPDATE agents SET updated_at = ? WHERE id = ?`, ts, agent.id);
      qRun(`INSERT INTO events(ts, agent_id, level, type, message, meta_json) VALUES (?, ?, ?, ?, ?, ?)`,
        ts, agent.id, 'info', 'heartbeat', 'heartbeat received', null);
      broadcast({ type: 'event:new', data: { ts, agent_id: agent.id, level: 'info', event_type: 'heartbeat', message: 'heartbeat received' } });
      broadcastNodeUpdate();
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && u.pathname === '/api/nodes') return json(res, 200, getNodesSnapshot(full));

    if (req.method === 'GET' && u.pathname === '/api/system/health') return json(res, 200, await computeSystemHealth(full));

    if (req.method === 'GET' && u.pathname === '/api/notify/status') {
      if (!isAdminSession(req)) return json(res, 401, { error: 'admin required' });
      return json(res, 200, {
        ok: true,
        enabled: ALERT_NOTIFY_ENABLED,
        telegram_configured: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
        min_interval_sec: ALERT_NOTIFY_MIN_INTERVAL_SEC,
      });
    }

    if (req.method === 'GET' && u.pathname === '/api/alerts') return json(res, 200, computeAlerts(full));

    if (req.method === 'POST' && u.pathname === '/api/alerts/ack') {
      if (!isAdminSession(req)) return json(res, 401, { error: 'admin required' });
      const body = await parseBody(req);
      const id = String(body.alert_id || '').trim();
      if (!id) return json(res, 400, { error: 'missing alert_id' });
      upsertAlertState(id, { acked: 1, acked_at: nowSec(), acked_by: ADMIN_USER });
      qRun(`INSERT INTO events(ts, agent_id, level, type, message, meta_json) VALUES (?, ?, ?, ?, ?, ?)`, nowSec(), null, 'info', 'alert_ack', `alert ack: ${id}`, null);
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && u.pathname === '/api/alerts/silence') {
      if (!isAdminSession(req)) return json(res, 401, { error: 'admin required' });
      const body = await parseBody(req);
      const id = String(body.alert_id || '').trim();
      const minutes = Math.max(1, Number(body.minutes || 30));
      if (!id) return json(res, 400, { error: 'missing alert_id' });
      const until = nowSec() + Math.floor(minutes * 60);
      upsertAlertState(id, { silence_until: until });
      qRun(`INSERT INTO events(ts, agent_id, level, type, message, meta_json) VALUES (?, ?, ?, ?, ?, ?)`, nowSec(), null, 'info', 'alert_silence', `alert silence: ${id}`, JSON.stringify({ minutes, until }));
      return json(res, 200, { ok: true, silence_until: until });
    }

    if (req.method === 'GET' && u.pathname === '/api/providers') {
      const snap = getNodesSnapshot(full);
      const items = await providerMatrix(snap.nodes);
      return json(res, 200, { ts: snap.ts, masked: snap.masked, items });
    }

    if (req.method === 'GET' && u.pathname === '/api/providers/debug') {
      return json(res, 200, { raw: process.env.PROVIDER_TARGETS || '', keys: PROVIDERS, targets: PROVIDER_TARGETS });
    }

    if (req.method === 'GET' && u.pathname === '/api/audit') {
      if (!isAdminSession(req)) return json(res, 401, { error: 'admin required' });
      const page = Math.max(1, Number(u.searchParams.get('page') || 1));
      const pageSize = Math.min(200, Math.max(1, Number(u.searchParams.get('pageSize') || 50)));
      const offset = (page - 1) * pageSize;
      const total = qGet(`SELECT COUNT(1) AS cnt FROM events WHERE type IN ('admin_login','admin_logout')`).cnt;
      const items = qAll(`SELECT * FROM events WHERE type IN ('admin_login','admin_logout') ORDER BY ts DESC LIMIT ? OFFSET ?`, pageSize, offset);
      return json(res, 200, { page, pageSize, total, totalPages: Math.ceil(total / pageSize), items });
    }

    if (req.method === 'GET' && u.pathname === '/api/audit/export.csv') {
      if (!isAdminSession(req)) return json(res, 401, { error: 'admin required' });
      const rows = qAll(`SELECT ts, level, type, message, meta_json FROM events WHERE type IN ('admin_login','admin_logout') ORDER BY ts DESC LIMIT 1000`);
      const esc = (s) => `"${String(s ?? '').replaceAll('"', '""')}"`;
      const lines = ['ts,level,type,message,meta_json'];
      for (const r of rows) lines.push([r.ts, r.level, r.type, r.message, r.meta_json].map(esc).join(','));
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="oc-monitor-audit.csv"',
      });
      return res.end(lines.join('\n'));
    }

    if (req.method === 'GET' && u.pathname === '/api/retention/status') {
      if (!isAdminSession(req)) return json(res, 401, { error: 'admin required' });
      const c1 = qGet(`SELECT COUNT(1) AS cnt FROM events`).cnt;
      const c2 = qGet(`SELECT COUNT(1) AS cnt FROM heartbeats`).cnt;
      return json(res, 200, {
        ok: true,
        retention_events_days: RETENTION_EVENTS_DAYS,
        retention_heartbeats_days: RETENTION_HEARTBEATS_DAYS,
        counts: { events: c1, heartbeats: c2 },
      });
    }

    if (req.method === 'POST' && u.pathname === '/api/retention/run') {
      if (!isAdminSession(req)) return json(res, 401, { error: 'admin required' });
      return json(res, 200, { ok: true, result: runRetentionCleanup() });
    }

    if (req.method === 'GET' && u.pathname === '/api/logs') {
      const page = Math.max(1, Number(u.searchParams.get('page') || 1));
      const pageSize = Math.min(200, Math.max(1, Number(u.searchParams.get('pageSize') || 50)));
      const level = u.searchParams.get('level') || null;
      const type = u.searchParams.get('type') || null;
      const agentId = u.searchParams.get('agent_id') || null;
      const offset = (page - 1) * pageSize;
      const total = qGet(`SELECT COUNT(1) AS cnt FROM events WHERE (? IS NULL OR level = ?) AND (? IS NULL OR type = ?) AND (? IS NULL OR agent_id = ?)`,
        level, level, type, type, agentId, agentId).cnt;
      let items = qAll(`SELECT * FROM events WHERE (? IS NULL OR level = ?) AND (? IS NULL OR type = ?) AND (? IS NULL OR agent_id = ?) ORDER BY ts DESC LIMIT ? OFFSET ?`,
        level, level, type, type, agentId, agentId, pageSize, offset);
      if (!full) {
        items = items.map((x) => ({ ...x, message: x.type === 'heartbeat' ? 'heartbeat received' : 'event', agent_id: x.agent_id ? `${x.agent_id.slice(0, 10)}***` : null }));
      }
      return json(res, 200, { page, pageSize, total, totalPages: Math.ceil(total / pageSize), items, masked: !full });
    }

    return json(res, 404, { error: 'not found' });
  } catch (e) {
    return json(res, 500, { error: e.message || 'internal error' });
  }
});

const wss = new WebSocketServer({ noServer: true });
const clients = new Set();
server.on('upgrade', (req, socket, head) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host}`);
    if (u.pathname !== '/ws') return socket.destroy();
    const full = isFullView(req, u);
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.isAlive = true;
      ws.full = full;
      clients.add(ws);
      ws.on('pong', () => (ws.isAlive = true));
      ws.on('close', () => clients.delete(ws));
      ws.send(JSON.stringify({ type: 'hello', data: { ts: nowSec(), full } }));
      ws.send(JSON.stringify({ type: 'node:update', data: getNodesSnapshot(full) }));
    });
  } catch { socket.destroy(); }
});

function broadcast(payload) {
  const s = JSON.stringify(payload);
  for (const ws of clients) if (ws.readyState === 1) ws.send(s);
}

function broadcastNodeUpdate() {
  for (const ws of clients) {
    if (ws.readyState !== 1) continue;
    ws.send(JSON.stringify({ type: 'node:update', data: getNodesSnapshot(!!ws.full) }));
  }
}

setInterval(() => {
  for (const ws of clients) {
    if (!ws.isAlive) { ws.terminate(); clients.delete(ws); continue; }
    ws.isAlive = false;
    ws.ping();
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping', data: { ts: nowSec() } }));
  }
}, 10_000);

// retention cleanup every 6 hours
setInterval(() => {
  try { runRetentionCleanup(); } catch {}
}, 6 * 60 * 60 * 1000);

// alert notifier loop (critical actionable only)
setInterval(() => {
  runAlertNotifierOnce().catch(() => {});
}, 30 * 1000);

server.listen(PORT, () => {
  console.log(`oc-monitor server listening on :${PORT}`);
  console.log(`db: ${DB_PATH}`);
  console.log(`dashboard token: ${DASHBOARD_TOKEN ? 'enabled' : 'disabled'}`);
  console.log(`alert notify: ${ALERT_NOTIFY_ENABLED ? 'enabled' : 'disabled'} | telegram: ${(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) ? 'configured' : 'not-configured'} | interval=${ALERT_NOTIFY_MIN_INTERVAL_SEC}s`);
});
