// Аккаунт жасау немесе құпиясөзін ауыстыру (сервер жағында, дерекқорға тікелей).
//   npm run user -- --username aigerim --role mentor [--name "Айгерім"] [--password ...]
// --password берілмесе, кездейсоқ құпиясөз жасалып, экранға бір рет шығады.
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
loadEnv(ROOT);
const { db } = await import('../lib/db.js');
const { hashPassword, ROLES } = await import('../lib/auth.js');

const args = {};
process.argv.slice(2).forEach((a, i, all) => { if (a.startsWith('--')) args[a.slice(2)] = all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true; });
const username = String(args.username || '').trim().toLowerCase();
const role = String(args.role || 'viewer');
if (!/^[a-z0-9._@-]{3,60}$/.test(username) || !ROLES.includes(role)) {
  console.error('Қолданылуы: npm run user -- --username <логин> --role admin|mentor|viewer [--name "Аты"] [--password <кемі 8 таңба>]');
  process.exit(1);
}
const password = typeof args.password === 'string' ? args.password : crypto.randomBytes(9).toString('base64url');
if (password.length < 8) { console.error('Құпиясөз кемі 8 таңба болсын.'); process.exit(1); }
const d = await db();
const name = typeof args.name === 'string' ? args.name : username;
const ex = (await d.query('select id from users where username = $1', [username])).rows[0];
if (ex) await d.query('update users set role = $2, display_name = $3, password_hash = $4, session_gen = session_gen + 1, active = true, updated_at = now() where id = $1', [ex.id, role, name, hashPassword(password)]);
else await d.query('insert into users (id, username, display_name, role, password_hash) values ($1,$2,$3,$4,$5)', ['u_' + crypto.randomBytes(6).toString('hex'), username, name, role, hashPassword(password)]);
await d.query("insert into audit (actor, entity, entity_id, action) values ('cli', 'user', $1, $2)", [username, ex ? 'cli_update' : 'cli_create']);
console.log(`${ex ? 'Жаңартылды' : 'Жасалды'}: ${username} (${role})${typeof args.password === 'string' ? '' : `\nҚұпиясөз: ${password}`}`);
await d.close();
