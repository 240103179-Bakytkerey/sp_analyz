// Дерекқор: production-да Postgres (DATABASE_URL, мысалы Vercel → Storage → Neon),
// компьютерде және тесттерде — PGlite (WASM ішіндегі нақты Postgres, ./.data/pg қалтасында).
// Екеуінде де бір SQL, бір миграциялар. Vercel-де DATABASE_URL жоқ болса, сайт деректі
// уақытша жадқа жазбайды — түсінікті қатемен тоқтайды.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { httpError } from './http.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = path.join(ROOT, 'lib', 'migrations');

let opening = null;

export function dbKind() {
  if (process.env.DATABASE_URL) return 'postgres';
  if (process.env.VERCEL) return 'missing';
  return 'local';
}

export function db() {
  if (!opening) opening = open().catch((e) => { opening = null; throw e; });
  return opening;
}

/** Тесттер үшін: келесі db() жаңа қойманы ашады. */
export async function resetDbForTests() {
  if (opening) {
    try { const d = await opening; await d.close(); } catch {}
  }
  opening = null;
}

async function open() {
  const kind = dbKind();
  let api;
  if (kind === 'missing') {
    throw httpError(503, 'Дерекқор қосылмаған: Vercel → Storage → Neon (Postgres) жасап, жобаға қосыңыз (DATABASE_URL), содан кейін Redeploy (README).', 'no_db');
  }
  if (kind === 'postgres') {
    const pg = (await import('pg')).default;
    const url = process.env.DATABASE_URL;
    const ssl = /sslmode=disable/.test(url) || /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
    const pool = new pg.Pool({ connectionString: url, ssl, max: Number(process.env.PG_POOL_MAX || 3) });
    const wrap = (c) => ({ query: (text, params) => c.query(text, params) });
    api = {
      kind,
      query: (text, params) => pool.query(text, params),
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query('begin');
          const out = await fn(wrap(client));
          await client.query('commit');
          return out;
        } catch (e) {
          try { await client.query('rollback'); } catch {}
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  } else {
    let PGlite;
    try {
      ({ PGlite } = await import('@electric-sql/pglite'));
    } catch {
      throw httpError(503, 'Жергілікті дерекқор (PGlite) орнатылмаған: npm install орындаңыз немесе DATABASE_URL беріңіз.', 'no_db');
    }
    const dir = process.env.LOCAL_DB_DIR || path.join(ROOT, '.data', 'pg');
    if (!dir.startsWith('memory://')) await fs.mkdir(dir, { recursive: true });
    const pg = new PGlite(dir);
    await pg.waitReady;
    // PGlite бір қосылыммен жұмыс істейді: транзакциялар кезекпен орындалады.
    let queue = Promise.resolve();
    const serial = (fn) => {
      const run = queue.then(fn, fn);
      queue = run.catch(() => {});
      return run;
    };
    api = {
      kind,
      query: (text, params) => serial(() => pg.query(text, params)),
      tx: (fn) => serial(() => pg.transaction((t) => fn({ query: (text, params) => t.query(text, params) }))),
      close: () => pg.close(),
    };
  }
  await migrate(api);
  return api;
}

async function migrate(api) {
  // .sql — SQL миграциясы; .mjs — деректі түзететін JS миграциясы (export async function up(q))
  const files = (await fs.readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql') || f.endsWith('.mjs')).sort();
  await api.tx(async (q) => {
    if (api.kind === 'postgres') await q.query('select pg_advisory_xact_lock(40400040)');
    await q.query('create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await q.query('select id from schema_migrations')).rows.map((r) => r.id));
    for (const f of files) {
      if (done.has(f)) continue;
      if (f.endsWith('.mjs')) {
        const m = await import(pathToFileURL(path.join(MIGRATIONS, f)).href);
        await m.up(q);
      } else {
        const sql = await fs.readFile(path.join(MIGRATIONS, f), 'utf8');
        for (const stmt of splitSql(sql)) await q.query(stmt);
      }
      await q.query('insert into schema_migrations (id) values ($1)', [f]);
    }
    const { seedCatalogIfEmpty } = await import('./seed.js');
    await seedCatalogIfEmpty(q);
  });
}

function splitSql(sql) {
  return sql
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n')
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const j = (v) => (v === undefined ? null : JSON.stringify(v));
