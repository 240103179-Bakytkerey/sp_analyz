// GET    /api/session — { user, db, publicView }
// POST   /api/session — { username, password } → кіру (HttpOnly cookie, 30 күн)
// DELETE /api/session — шығу
import { route } from '../lib/route.js';
import { readBody, send, httpError, clientIp } from '../lib/http.js';
import { db, dbKind } from '../lib/db.js';
import { currentUser, publicUser, verifyPassword, sessionCookie, clearedCookie, tooManyAttempts, noteFailedAttempt, publicView } from '../lib/auth.js';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export default route({
  async GET(req) {
    const kind = dbKind();
    let user = null, dbOk = true, dbMessage = null, users = null;
    try {
      const d = await db();
      user = publicUser(await currentUser(req));
      users = (await d.query('select count(*)::int as n from users')).rows[0].n;
    } catch (e) {
      dbOk = false;
      dbMessage = e && e.expose ? e.message : 'Дерекқорға қосылу мүмкін болмады.';
    }
    return { db: kind, dbOk, dbMessage, publicView: publicView(), hasUsers: users == null ? null : users > 0, user };
  },
  async POST(req, res) {
    const ip = clientIp(req);
    const { username, password } = await readBody(req, 10_000);
    const name = String(username || '').trim().toLowerCase();
    if (tooManyAttempts(ip) || tooManyAttempts('u:' + name)) throw httpError(429, 'Тым көп әрекет. 10 минуттан кейін қайталаңыз.', 'rate_limited');
    const d = await db();
    const u = (await d.query('select * from users where username = $1', [name])).rows[0];
    if (!u || !u.active || !verifyPassword(password, u.password_hash)) {
      noteFailedAttempt(ip); noteFailedAttempt('u:' + name);
      await pause(600);
      throw httpError(401, 'Логин немесе құпиясөз қате.');
    }
    send(res, 200, { user: publicUser(u) }, { 'Set-Cookie': await sessionCookie(u) });
  },
  async DELETE(req, res) {
    send(res, 200, { user: null }, { 'Set-Cookie': clearedCookie() });
  },
});
