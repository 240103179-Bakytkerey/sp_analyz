// Сайтты өз компьютеріңізде іске қосу: public/ ішіндегі бет және Vercel-дегідей /api маршруттары.
// Дерек ./.data/pg ішіндегі PGlite-та (DATABASE_URL берілсе — Postgres-те).
//   npm run dev   →   http://localhost:3000   (әкімші бөлімі: /admin)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from './env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
loadEnv(ROOT);

const routes = {};
for (const f of fs.readdirSync(path.join(ROOT, 'api'))) {
  if (f.endsWith('.js')) routes['/api/' + f.slice(0, -3)] = (await import(pathToFileURL(path.join(ROOT, 'api', f)).href)).default;
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon' };
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const api = routes[url.pathname];
  if (api) return api(req, res);
  const rel = url.pathname === '/' || /^\/admin\/?$/.test(url.pathname) ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.resolve(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) { res.statusCode = 403; return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(buf);
  });
}).listen(PORT, async () => {
  console.log(`JUZ40 SMART PRO: http://localhost:${PORT}   әкімші бөлімі: http://localhost:${PORT}/admin`);
  try {
    const { db } = await import('../lib/db.js');
    const { ensureBootstrapAdmin } = await import('../lib/auth.js');
    await ensureBootstrapAdmin();
    const d = await db();
    const n = (await d.query('select count(*)::int as n from users')).rows[0].n;
    if (!n) console.log('  Әзірге аккаунт жоқ: .env.local ішінде BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD беріңіз немесе `npm run user -- --role admin --username <логин>` орындаңыз.');
  } catch (e) {
    console.log('  Дерекқор:', e.message);
  }
});
