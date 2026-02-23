import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('D:/oc-monitor-v21/runtime/monitor.db');
// keep latest Wolf-Server by updated_at, disable others
const rows = db.prepare("SELECT id, name, updated_at FROM agents WHERE name='Wolf-Server' ORDER BY updated_at DESC").all();
if (rows.length > 1) {
  const keep = rows[0].id;
  for (const r of rows.slice(1)) {
    db.prepare('UPDATE agents SET enabled=0 WHERE id=?').run(r.id);
  }
  console.log('kept', keep, 'disabled', rows.length - 1);
} else {
  console.log('nothing to cleanup');
}
