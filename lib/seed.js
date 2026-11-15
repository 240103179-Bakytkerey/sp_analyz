// Бастапқы анықтамалық (16 пән, 3 ағым, 26 мұғалім, 48 тағайындау, БХ/ФХ комбинациялары).
// Дерекқордағы пәндер кестесі бос болғанда ғана бір рет жүктеледі — кейінгі өзгерістерді баспайды.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'seed', 'catalog.json');

export async function loadCatalogSeed() {
  return JSON.parse(await fs.readFile(FILE, 'utf8'));
}

export async function seedCatalogIfEmpty(q) {
  const { rows } = await q.query('select count(*)::int as n from subjects');
  if (rows[0].n > 0) return false;
  const c = await loadCatalogSeed();
  for (const s of c.subjects) {
    await q.query('insert into subjects (id, name, short, glyph, glyphs, sort, sapaline_code, logo, color) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [s.id, s.name, s.short, s.glyph, s.glyphs, s.sort, s.sapaline_code || null, s.logo || null, s.color || null]);
  }
  for (const s of c.streams) await q.query('insert into streams (id, name, short, sort) values ($1,$2,$3,$4)', [s.id, s.name, s.short, s.sort]);
  for (const k of c.combinations) {
    await q.query('insert into combinations (id, code, name, sort, aliases, subjects) values ($1,$2,$3,$4,$5::jsonb,$6::jsonb) on conflict do nothing', [k.id, k.code, k.name, k.sort, JSON.stringify(k.aliases || []), JSON.stringify(k.subjects || [])]);
  }
  for (const t of c.teachers) {
    await q.query('insert into teachers (id, full_name, display, aliases, photo) values ($1,$2,$3,$4::jsonb,$5)', [t.id, t.full_name, t.display, JSON.stringify(t.aliases || []), t.photo]);
  }
  for (const a of c.assignments) {
    await q.query('insert into assignments (id, teacher_id, stream_id, subject_id, valid_from, valid_to, note) values ($1,$2,$3,$4,$5,$6,$7)', [a.id, a.teacher_id, a.stream_id, a.subject_id, a.valid_from, a.valid_to, a.note || '']);
  }
  await q.query("insert into audit (actor, entity, action, after) values ('system', 'catalog', 'seed', $1::jsonb)", [
    JSON.stringify({ subjects: c.subjects.length, teachers: c.teachers.length, assignments: c.assignments.length }),
  ]);
  return true;
}
