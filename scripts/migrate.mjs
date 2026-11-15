// Дерекқор кестелерін жасайды/жаңартады және бос болса бастапқы анықтамалықты жүктейді.
// API да алғашқы сұраныста осыны өзі орындайды; бұл команда — алдын ала тексеру үшін.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
loadEnv(ROOT);
const { db, dbKind } = await import('../lib/db.js');
const d = await db();
const q = async (sql) => (await d.query(sql)).rows[0].n;
console.log(`Дерекқор: ${dbKind()} · пән ${await q('select count(*)::int n from subjects')} · мұғалім ${await q('select count(*)::int n from teachers')} · тағайындау ${await q('select count(*)::int n from assignments')} · есеп ${await q('select count(*)::int n from reports')}`);
await d.close();
