// Пайдаланушылар (тек әкімші).
// GET  /api/users
// POST /api/users { id?, username, displayName, role, teacherId, scope, password?, active }
//   — құпиясөз өзгерсе не аккаунт өшірілсе, сол адамның барлық сессиясы жарамсыз болады (session_gen).
import { route } from '../lib/route.js';
import { readBody, httpError } from '../lib/http.js';
import { requireUser, hashPassword, ROLES } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { audit, newId } from '../lib/repo.js';

const out = (u) => ({ id: u.id, username: u.username, displayName: u.display_name, role: u.role, teacherId: u.teacher_id, scope: u.scope || {}, active: u.active, createdAt: u.created_at, updatedAt: u.updated_at });

function cleanScope(s) {
  const list = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 50) : []);
  s = s || {};
  return { streams: list(s.streams), subjects: list(s.subjects), types: list(s.types).filter((t) => ['ls', 'st', 'bt'].includes(t)) };
}

export default route({
  async GET(req) {
    await requireUser(req, ['admin']);
    const d = await db();
    return { users: (await d.query('select * from users order by role, username')).rows.map(out) };
  },
  async POST(req) {
    const admin = await requireUser(req, ['admin']);
    const b = await readBody(req, 20_000);
    const username = String(b.username || '').trim().toLowerCase();
    if (!/^[a-z0-9._@-]{3,60}$/.test(username)) throw httpError(400, 'Логин: 3–60 таңба, латын әріптері, сандар, . _ - @');
    if (!ROLES.includes(b.role)) throw httpError(400, 'Рөл: admin, mentor немесе viewer.');
    const display = String(b.displayName || username).trim().slice(0, 120);
    const pw = b.password ? String(b.password) : '';
    if (pw && pw.length < 8) throw httpError(400, 'Құпиясөз кемі 8 таңба болсын.');
    const d = await db();
    return d.tx(async (q) => {
      const before = b.id ? (await q.query('select * from users where id = $1', [b.id])).rows[0] : null;
      if (b.id && !before) throw httpError(404, 'Пайдаланушы табылмады.');
      if (before && before.id === admin.id && (b.role !== 'admin' || b.active === false)) throw httpError(400, 'Өз әкімші рөліңізді алып тастай не өшіре алмайсыз.');
      const teacherId = b.teacherId ? String(b.teacherId) : null;
      if (teacherId && !(await q.query('select 1 from teachers where id = $1', [teacherId])).rows.length) throw httpError(400, 'Мұғалім табылмады.');
      let row;
      try {
        if (before) {
          const bump = pw || b.active === false || before.role !== b.role ? 1 : 0;
          row = (await q.query(
            'update users set username = $2, display_name = $3, role = $4, teacher_id = $5, scope = $6::jsonb, active = $7, password_hash = coalesce($8, password_hash), session_gen = session_gen + $9, updated_at = now() where id = $1 returning *',
            [before.id, username, display, b.role, teacherId, JSON.stringify(cleanScope(b.scope)), b.active !== false, pw ? hashPassword(pw) : null, bump],
          )).rows[0];
        } else {
          if (!pw) throw httpError(400, 'Жаңа аккаунтқа құпиясөз керек.');
          row = (await q.query('insert into users (id, username, display_name, role, teacher_id, scope, password_hash, active) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) returning *', [
            newId('u'), username, display, b.role, teacherId, JSON.stringify(cleanScope(b.scope)), hashPassword(pw), b.active !== false,
          ])).rows[0];
        }
      } catch (e) {
        if (/duplicate key|unique/i.test(String(e.message))) throw httpError(409, 'Бұл логин бос емес.', 'duplicate');
        throw e;
      }
      await audit(q, admin.username, 'user', row.id, before ? 'update' : 'create', before && out(before), out(row));
      return { user: out(row) };
    });
  },
});
