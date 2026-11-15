// Аккаунттар мен сессиялар.
// Әр адамның жеке аккаунты бар (users кестесі): admin / mentor / viewer.
// Кіргеннен кейін HttpOnly cookie: userId.gen.exp.hmac — сервер әр сұраныста пайдаланушыны
// дерекқордан қайта оқып, белсенді екенін және сессия буынын (gen) тексереді. Құпиясөз ауысса
// немесе аккаунт өшірілсе, бұрынғы сессиялардың бәрі жарамсыз болады.
//
// Рөл тексеру тек серверде: requireUser(req, ['mentor','admin']) әр API әрекетінің басында тұрады.
import crypto from 'node:crypto';
import { db } from './db.js';
import { httpError } from './http.js';

const COOKIE = 'sp_session';
const DAYS = 30;
export const ROLES = ['admin', 'mentor', 'viewer'];

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const hash = crypto.scryptSync(String(password), salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password, stored) {
  const [kind, N, r, p, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64url');
  const got = crypto.scryptSync(String(password || ''), Buffer.from(salt, 'base64url'), want.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

let secretCache = null;
async function secret() {
  const s = process.env.SESSION_SECRET || '';
  if (s.length >= 16) return s;
  if (secretCache) return secretCache;
  // SESSION_SECRET берілмесе: кездейсоқ кілт бір рет жасалып, дерекқордағы settings кестесінде сақталады.
  const d = await db();
  const fresh = crypto.randomBytes(32).toString('base64url');
  await d.query("insert into settings (key, value) values ('session_secret', $1::jsonb) on conflict (key) do nothing", [JSON.stringify(fresh)]);
  const { rows } = await d.query("select value from settings where key = 'session_secret'");
  secretCache = rows[0].value;
  return secretCache;
}

const sign = async (v) => crypto.createHmac('sha256', await secret()).update(v).digest('base64url');
const secureFlag = () => (process.env.VERCEL ? '; Secure' : '');

export async function sessionCookie(user) {
  const exp = Date.now() + DAYS * 864e5;
  const body = `${user.id}.${user.session_gen}.${exp}`;
  return `${COOKIE}=${body}.${await sign(body)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAYS * 86400}${secureFlag()}`;
}

export function clearedCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag()}`;
}

export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, displayName: u.display_name, role: u.role, teacherId: u.teacher_id || null, scope: u.scope || {} };
}

/** Cookie бойынша пайдаланушы немесе null. */
export async function currentUser(req) {
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)sp_session=([^;]+)/);
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length !== 4) return null;
  const [id, gen, exp, sig] = parts;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() || !/^\d+$/.test(gen)) return null;
  let good;
  try {
    good = await sign(`${id}.${gen}.${exp}`);
  } catch {
    return null;
  }
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  const d = await db();
  const { rows } = await d.query('select * from users where id = $1', [id]);
  const u = rows[0];
  if (!u || !u.active || String(u.session_gen) !== gen) return null;
  return u;
}

export const publicView = () => process.env.PUBLIC_VIEW === '1';

/**
 * Сұраныстың пайдаланушысы, рөлі рұқсат етілгендердің ішінде болуы керек.
 * roles = null — кез келген кірген адам (немесе PUBLIC_VIEW=1 болса, кірмеген адам да; онда null қайтарады).
 */
export async function requireUser(req, roles, { allowAnonymous = false } = {}) {
  const u = await currentUser(req);
  if (!u) {
    if (allowAnonymous && publicView()) return null;
    throw httpError(401, 'Жүйеге кіріңіз.', 'unauthorized');
  }
  if (roles && !roles.includes(u.role)) throw httpError(403, 'Бұл әрекетке рұқсатыңыз жоқ.', 'forbidden');
  return u;
}

/** Ментордың рұқсат аумағы: scope = { streams?: [], subjects?: [], types?: [] }; бос тізім — шектеу жоқ. */
export function canEditReport(user, { type, stream_id, subject_id }) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'mentor') return false;
  const s = user.scope || {};
  const ok = (list, v) => !Array.isArray(list) || !list.length || v == null || list.includes(v);
  return ok(s.types, type) && ok(s.streams, stream_id) && ok(s.subjects, subject_id);
}

export function assertCanEdit(user, report) {
  if (!canEditReport(user, report)) throw httpError(403, 'Бұл есепті өңдеуге рұқсатыңыз жоқ (ағым/пән/түр шектеуі).', 'forbidden');
}

/** Жүйеде әкімші жоқ болса және BOOTSTRAP_ADMIN_* айнымалылары берілсе — бірінші әкімшіні жасайды. */
export async function ensureBootstrapAdmin() {
  const username = (process.env.BOOTSTRAP_ADMIN_USERNAME || '').trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
  if (!username || password.length < 8) return false;
  const d = await db();
  const { rows } = await d.query("select count(*)::int as n from users where role = 'admin'");
  if (rows[0].n > 0) return false;
  await d.query(
    "insert into users (id, username, display_name, role, password_hash) values ($1, $2, $3, 'admin', $4) on conflict (username) do nothing",
    ['u_' + crypto.randomBytes(6).toString('hex'), username.toLowerCase(), username, hashPassword(password)],
  );
  await d.query("insert into audit (actor, entity, entity_id, action) values ('system', 'user', $1, 'bootstrap_admin')", [username.toLowerCase()]);
  return true;
}

// Құпиясөз теруге шектеу (әр сервер данасында).
const attempts = new Map();
export function tooManyAttempts(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < 10 * 60e3);
  attempts.set(key, list);
  return list.length >= 8;
}
export function noteFailedAttempt(key) {
  const list = attempts.get(key) || [];
  list.push(Date.now());
  attempts.set(key, list);
  if (attempts.size > 5000) attempts.clear();
}
