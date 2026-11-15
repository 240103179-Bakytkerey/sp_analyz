// Деректерге қол жеткізу: анықтамалық, кезеңдер, есептер, нұсқалар, «Таныстым», аудит.
// Рұқсат API қабатында (requireUser / assertCanEdit) тексеріледі; мұнда — бизнес-ережелер.
import crypto from 'node:crypto';
import { db, j } from './db.js';
import { httpError } from './http.js';
import { normalizeReport } from './validate.js';
import { periodSeq } from './calc.js';

export const newId = (p) => `${p}_${crypto.randomBytes(6).toString('hex')}`;
const now = () => new Date().toISOString();

export async function audit(q, actor, entity, entityId, action, before, after) {
  await q.query('insert into audit (actor, entity, entity_id, action, before, after) values ($1,$2,$3,$4,$5::jsonb,$6::jsonb)', [
    actor || null, entity, entityId || null, action, j(before ?? null), j(after ?? null),
  ]);
}

/* ============================== анықтамалық ============================== */

export async function getCatalog(q) {
  q = q || (await db());
  const [subjects, streams, combinations, teachers, assignments, periods] = await Promise.all([
    q.query('select * from subjects order by sort, name'),
    q.query('select * from streams order by sort, name'),
    q.query('select * from combinations order by sort, code'),
    q.query('select id, full_name, display, aliases, photo, active from teachers order by full_name'),
    q.query('select * from assignments order by stream_id, subject_id, coalesce(valid_from, \'\')'),
    q.query('select * from periods order by stream_id, kind, seq'),
  ]);
  return {
    subjects: subjects.rows,
    streams: streams.rows,
    combinations: combinations.rows,
    teachers: teachers.rows,
    assignments: assignments.rows,
    periods: periods.rows,
  };
}

/** Кезеңнің күні бойынша сол ағым+пәндегі мұғалім (тарихи тағайындау). */
export function assignmentAt(catalog, streamId, subjectId, date) {
  const list = catalog.assignments.filter((a) => a.stream_id === streamId && a.subject_id === subjectId);
  if (!list.length) return null;
  const d = date || '';
  const fits = list.filter((a) => (!a.valid_from || !d || a.valid_from <= d) && (!a.valid_to || !d || a.valid_to >= d));
  const pool = fits.length ? fits : d ? [] : list;
  // Бірнеше сәйкес болса — ең кеш басталғаны.
  return pool.sort((a, b) => String(b.valid_from || '').localeCompare(String(a.valid_from || '')))[0] || null;
}

const ENTITY = {
  subjects: { table: 'subjects', fields: ['name', 'short', 'glyph', 'glyphs', 'color', 'logo', 'sapaline_code', 'platform_code', 'max_scores', 'sort', 'active'], json: ['max_scores'], prefix: 's' },
  streams: { table: 'streams', fields: ['name', 'short', 'sort', 'active'], prefix: 'st' },
  combinations: { table: 'combinations', fields: ['code', 'name', 'note', 'sort', 'active'], prefix: 'c' },
  teachers: { table: 'teachers', fields: ['full_name', 'display', 'aliases', 'photo', 'active'], json: ['aliases'], prefix: 't' },
  assignments: { table: 'assignments', fields: ['teacher_id', 'stream_id', 'subject_id', 'valid_from', 'valid_to', 'note'], prefix: 'a' },
  periods: { table: 'periods', fields: ['stream_id', 'kind', 'month', 'week', 'test_date', 'label', 'cohort', 'date_from', 'date_to', 'seq'], prefix: 'p' },
};

function cleanEntity(kind, input) {
  const spec = ENTITY[kind];
  if (!spec) throw httpError(400, 'Белгісіз анықтамалық.');
  const out = {};
  for (const f of spec.fields) {
    if (!(f in input)) continue;
    let v = input[f];
    if (spec.json && spec.json.includes(f)) {
      if (f === 'aliases') v = (Array.isArray(v) ? v : String(v || '').split(/[,;\n]/)).map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
      else v = v && typeof v === 'object' ? v : {};
    } else if (['sort', 'month', 'week', 'seq'].includes(f)) {
      v = v === '' || v == null ? null : Number(v);
      if (v != null && !Number.isInteger(v)) throw httpError(400, `«${f}» бүтін сан болуы керек.`);
    } else if (f === 'active') v = v !== false && v !== 'false';
    else if (['valid_from', 'valid_to', 'test_date', 'date_from', 'date_to'].includes(f)) {
      v = v ? String(v).slice(0, 10) : null;
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw httpError(400, 'Күн ЖЖЖЖ-АА-КК түрінде болуы керек.');
    } else v = v == null ? null : String(v).trim().slice(0, 300);
    out[f] = v;
  }
  return out;
}

export async function saveEntity(user, kind, input) {
  const spec = ENTITY[kind];
  const d = await db();
  const fields = cleanEntity(kind, input || {});
  return d.tx(async (q) => {
    const id = input.id ? String(input.id) : null;
    const before = id ? (await q.query(`select * from ${spec.table} where id = $1`, [id])).rows[0] : null;
    if (kind === 'teachers' && fields.full_name === '') throw httpError(400, 'Мұғалімнің аты-жөні бос болмауы керек.');
    if (kind === 'subjects' && fields.name === '') throw httpError(400, 'Пән атауы бос болмауы керек.');
    if (kind === 'combinations' && fields.code === '') throw httpError(400, 'Комбинация коды бос болмауы керек.');
    if (kind === 'periods') {
      const p = { ...(before || {}), ...fields };
      if (!p.stream_id || !['week', 'bt'].includes(p.kind)) throw httpError(400, 'Кезеңнің ағымы мен түрі керек.');
      if (p.kind === 'week' && (!(p.month >= 1) || !(p.week >= 1))) throw httpError(400, 'Оқу айы мен аптасы керек.');
      if (!p.label) fields.label = p.kind === 'week' ? `${p.month}-ай ${p.week}-апта` : p.test_date || 'БТ';
      if (p.seq == null) fields.seq = p.kind === 'week' ? periodSeq(p.month, p.week) : Number(String(p.test_date || '').replace(/-/g, '')) || 1;
    }
    if (kind === 'assignments') {
      const a = { ...(before || {}), ...fields };
      if (!a.teacher_id || !a.stream_id || !a.subject_id) throw httpError(400, 'Мұғалім, ағым және пән таңдалуы керек.');
      if (a.valid_from && a.valid_to && a.valid_from > a.valid_to) throw httpError(400, 'Тағайындаудың басы соңынан кейін тұр.');
    }
    let row;
    try {
      if (before) {
        const keys = Object.keys(fields);
        if (!keys.length) return before;
        const sets = keys.map((k, i) => `${k} = $${i + 2}${spec.json && spec.json.includes(k) ? '::jsonb' : ''}`);
        if (['teachers'].includes(kind)) sets.push('updated_at = now()');
        const vals = keys.map((k) => (spec.json && spec.json.includes(k) ? j(fields[k]) : fields[k]));
        row = (await q.query(`update ${spec.table} set ${sets.join(', ')} where id = $1 returning *`, [id, ...vals])).rows[0];
      } else {
        const newKey = id || newId(spec.prefix);
        const keys = Object.keys(fields);
        const cols = ['id', ...keys];
        const ph = cols.map((k, i) => `$${i + 1}${spec.json && spec.json.includes(k) ? '::jsonb' : ''}`);
        const vals = [newKey, ...keys.map((k) => (spec.json && spec.json.includes(k) ? j(fields[k]) : fields[k]))];
        row = (await q.query(`insert into ${spec.table} (${cols.join(', ')}) values (${ph.join(', ')}) returning *`, vals)).rows[0];
      }
    } catch (e) {
      if (/duplicate key|unique/i.test(String(e.message))) throw httpError(409, 'Мұндай жазба бұрыннан бар (код/кезең қайталанады).', 'duplicate');
      if (/foreign key/i.test(String(e.message))) throw httpError(400, 'Байланысты жазба табылмады.', 'bad_ref');
      throw e;
    }
    await audit(q, user.username, kind, row.id, before ? 'update' : 'create', before, row);
    return row;
  });
}

export async function deleteEntity(user, kind, id) {
  const spec = ENTITY[kind];
  if (!spec) throw httpError(400, 'Белгісіз анықтамалық.');
  const d = await db();
  return d.tx(async (q) => {
    const before = (await q.query(`select * from ${spec.table} where id = $1`, [id])).rows[0];
    if (!before) throw httpError(404, 'Жазба табылмады.');
    const used = {
      subjects: 'select 1 from reports where subject_id = $1 union all select 1 from assignments where subject_id = $1 limit 1',
      streams: 'select 1 from reports where stream_id = $1 union all select 1 from assignments where stream_id = $1 limit 1',
      teachers: 'select 1 from reports where teacher_id = $1 union all select 1 from assignments where teacher_id = $1 limit 1',
      periods: 'select 1 from reports where period_id = $1 limit 1',
      combinations: null,
      assignments: null,
    }[kind];
    if (used && (await q.query(used, [id])).rows.length) {
      throw httpError(409, 'Бұл жазба есептерде немесе тағайындауларда қолданылады. Өшірудің орнына «белсенді емес» етіңіз (тарих сақталады).', 'in_use');
    }
    if (kind === 'combinations') {
      const { rows } = await q.query("select id from reports where data::text like $1 limit 1", [`%"${id}"%`]);
      if (rows.length) throw httpError(409, 'Комбинация есептерде қолданылады. Оны «белсенді емес» етіңіз.', 'in_use');
    }
    await q.query(`delete from ${spec.table} where id = $1`, [id]);
    await audit(q, user.username, kind, id, 'delete', before, null);
    return { ok: true };
  });
}

/* ============================== кезеңдер ============================== */

export async function ensurePeriod(q, user, spec) {
  const streamId = spec.stream_id;
  if (!streamId) throw httpError(400, 'Ағым таңдалмаған.');
  if (spec.id) {
    const { rows } = await q.query('select * from periods where id = $1', [spec.id]);
    if (!rows[0]) throw httpError(400, 'Кезең табылмады.');
    if (rows[0].stream_id !== streamId) throw httpError(400, 'Кезең басқа ағымның күнтізбесіне жатады.');
    return rows[0];
  }
  if (spec.kind === 'week') {
    const month = Number(spec.month), week = Number(spec.week);
    if (!(month >= 1 && month <= 60 && week >= 1 && week <= 10)) throw httpError(400, 'Оқу айы (1–60) мен аптасы (1–10) дұрыс емес.');
    const found = (await q.query("select * from periods where stream_id = $1 and kind = 'week' and month = $2 and week = $3", [streamId, month, week])).rows[0];
    if (found) return found;
    const row = (await q.query("insert into periods (id, stream_id, kind, month, week, label, seq) values ($1,$2,'week',$3,$4,$5,$6) returning *", [
      newId('p'), streamId, month, week, `${month}-ай ${week}-апта`, periodSeq(month, week),
    ])).rows[0];
    await audit(q, user && user.username, 'periods', row.id, 'create', null, row);
    return row;
  }
  if (spec.kind === 'bt') {
    const date = spec.test_date ? String(spec.test_date).slice(0, 10) : null;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw httpError(400, 'Тест күні ЖЖЖЖ-АА-КК түрінде болуы керек.');
    const label = String(spec.label || '').trim().slice(0, 80) || (date ? `БТ ${date.split('-').reverse().join('.')}` : '');
    if (!label) throw httpError(400, 'БТ үшін тест күнін немесе атауын (мысалы «Қараша БТ») жазыңыз.');
    const found = (await q.query("select * from periods where stream_id = $1 and kind = 'bt' and label = $2", [streamId, label])).rows[0];
    if (found) return found;
    const seq = date ? Number(date.replace(/-/g, '')) : Number(spec.seq) || Number(String(Date.now()).slice(0, 8));
    const row = (await q.query("insert into periods (id, stream_id, kind, month, test_date, label, cohort, seq) values ($1,$2,'bt',$3,$4,$5,$6,$7) returning *", [
      newId('p'), streamId, spec.month ? Number(spec.month) : null, date, label, String(spec.cohort || '').slice(0, 120), seq,
    ])).rows[0];
    await audit(q, user && user.username, 'periods', row.id, 'create', null, row);
    return row;
  }
  throw httpError(400, 'Кезең түрі белгісіз.');
}

export const periodKey = (p) => (p.kind === 'week' ? `${p.month}-${p.week}` : `bt-${p.test_date || p.label}`);

/* ============================== есептер ============================== */

function rowToReport(r) {
  return r && {
    id: r.id, type: r.type, stream_id: r.stream_id, subject_id: r.subject_id, teacher_id: r.teacher_id, period_id: r.period_id, scope: r.scope,
    status: r.status, version: r.version, data: r.data, published: r.published, published_rev: r.published_rev, published_at: r.published_at,
    published_by: r.published_by, demo: r.demo, created_by: r.created_by, created_at: r.created_at, updated_by: r.updated_by, updated_at: r.updated_at,
    dirty: r.status === 'published' && JSON.stringify(r.published && r.published.data) !== JSON.stringify(r.data),
  };
}

export async function getReport(id, q) {
  q = q || (await db());
  const { rows } = await q.query('select * from reports where id = $1', [id]);
  return rowToReport(rows[0]);
}

export async function listReports(filters = {}) {
  const d = await db();
  const where = [], vals = [];
  const add = (sql, v) => { vals.push(v); where.push(sql.replace('?', `$${vals.length}`)); };
  if (filters.type) add('type = ?', filters.type);
  if (filters.stream) add('stream_id = ?', filters.stream);
  if (filters.subject) add('subject_id = ?', filters.subject);
  if (filters.period) add('period_id = ?', filters.period);
  if (filters.status) add('status = ?', filters.status);
  const { rows } = await d.query(`select * from reports ${where.length ? 'where ' + where.join(' and ') : ''} order by updated_at desc limit 500`, vals);
  return rows.map(rowToReport);
}

async function ctxFor(q) {
  const [c, s] = await Promise.all([q.query('select id from combinations'), q.query('select id from subjects')]);
  return { comboIds: new Set(c.rows.map((r) => r.id)), subjectIds: new Set(s.rows.map((r) => r.id)) };
}

async function addRevision(q, rep, action, actor) {
  await q.query('insert into report_revisions (report_id, version, action, status, data, teacher_id, actor) values ($1,$2,$3,$4,$5::jsonb,$6,$7)', [
    rep.id, rep.version, action, rep.status, j(rep.data), rep.teacher_id, actor,
  ]);
}

/** Жаңа есеп (жоба күйінде). Бірдей кілтті есеп бар болса — 409 және оның id-і. */
export async function createReport(user, input) {
  const d = await db();
  return d.tx(async (q) => {
    const type = input.type;
    if (!['ls', 'st', 'bt'].includes(type)) throw httpError(400, 'Есеп түрі таңдалмаған.');
    const streamId = String(input.stream_id || '');
    const stream = (await q.query('select id from streams where id = $1', [streamId])).rows[0];
    if (!stream) throw httpError(400, 'Ағым табылмады.');
    let subjectId = null, teacherId = null, scope = 'all';
    const period = await ensurePeriod(q, user, { ...(input.period || {}), stream_id: streamId, kind: type === 'bt' ? 'bt' : 'week' });
    if (type === 'bt') {
      if (period.kind !== 'bt') throw httpError(400, 'БТ есебі БТ кезеңіне ғана жазылады.');
      scope = input.scope && input.scope !== 'all' ? String(input.scope) : 'all';
      if (scope !== 'all' && !(await q.query('select 1 from combinations where id = $1', [scope])).rows.length) throw httpError(400, 'Комбинация табылмады.');
    } else {
      if (period.kind !== 'week') throw httpError(400, 'ЛС/СТ есебі оқу аптасына жазылады.');
      subjectId = String(input.subject_id || '');
      if (!(await q.query('select 1 from subjects where id = $1', [subjectId])).rows.length) throw httpError(400, 'Пән табылмады.');
      const catalog = await getCatalog(q);
      if (input.teacher_id) {
        if (!(await q.query('select 1 from teachers where id = $1', [input.teacher_id])).rows.length) throw httpError(400, 'Мұғалім табылмады.');
        teacherId = input.teacher_id;
      } else {
        const a = assignmentAt(catalog, streamId, subjectId, period.date_from);
        if (!a) throw httpError(400, 'Бұл ағым мен пәнге мұғалім тағайындалмаған. Әкімші бөлімінде тағайындау қосыңыз немесе мұғалімді таңдаңыз.', 'no_assignment');
        teacherId = a.teacher_id;
      }
    }
    const { assertCanEdit } = await import('./auth.js');
    assertCanEdit(user, { type, stream_id: streamId, subject_id: subjectId });
    const existing = (await q.query("select id from reports where type = $1 and stream_id = $2 and coalesce(subject_id, '') = $3 and period_id = $4 and scope = $5", [type, streamId, subjectId || '', period.id, scope])).rows[0];
    if (existing) {
      const e = httpError(409, 'Бұл кезеңге мұндай есеп бұрыннан бар — соны ашып өңдеңіз.', 'exists');
      e.reportId = existing.id;
      throw e;
    }
    const ctx = await ctxFor(q);
    const norm = normalizeReport(type, input.data || {}, { ...ctx, prevImported: null });
    const id = newId('r');
    const row = (await q.query(
      `insert into reports (id, type, stream_id, subject_id, teacher_id, period_id, scope, status, version, data, demo, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,'draft',1,$8::jsonb,$9,$10,$10) returning *`,
      [id, type, streamId, subjectId, teacherId, period.id, scope, j(norm.data), !!input.demo, user.username],
    )).rows[0];
    const rep = rowToReport(row);
    await addRevision(q, rep, 'create', user.username);
    await audit(q, user.username, 'report', id, 'create', null, { type, streamId, subjectId, period: period.label, scope });
    return { report: rep, warnings: norm.warnings };
  });
}

function conflictError(current) {
  const e = httpError(409, `Бұл есепті сіз ашқаннан кейін ${current.updated_by || 'басқа адам'} өзгертті. Сіздің өзгерісіңіз әлі сақталмады: жаңа нұсқаны қарап, өзгерісті қайта енгізіңіз.`, 'conflict');
  e.current = current;
  return e;
}

async function lockReport(q, id, version) {
  const cur = rowToReport((await q.query('select * from reports where id = $1 for update', [id])).rows[0]);
  if (!cur) throw httpError(404, 'Есеп табылмады.');
  if (version != null && Number(version) !== cur.version) throw conflictError(cur);
  return cur;
}

/** Есепті сақтау: version сәйкес келмесе — 409, ешкімнің өзгерісі үнсіз жоғалмайды. */
export async function updateReport(user, id, input) {
  const d = await db();
  const { assertCanEdit } = await import('./auth.js');
  return d.tx(async (q) => {
    const cur = await lockReport(q, id, input.version);
    assertCanEdit(user, cur);
    const ctx = await ctxFor(q);
    const norm = normalizeReport(cur.type, input.data || {}, { ...ctx, prevImported: cur.data && cur.data.imported });
    let teacherId = cur.teacher_id;
    if (cur.type !== 'bt' && input.teacher_id && input.teacher_id !== cur.teacher_id) {
      if (!(await q.query('select 1 from teachers where id = $1', [input.teacher_id])).rows.length) throw httpError(400, 'Мұғалім табылмады.');
      teacherId = input.teacher_id;
    }
    const row = (await q.query('update reports set data = $2::jsonb, teacher_id = $3, version = version + 1, updated_by = $4, updated_at = now() where id = $1 returning *', [
      id, j(norm.data), teacherId, user.username,
    ])).rows[0];
    const rep = rowToReport(row);
    await addRevision(q, rep, 'save', user.username);
    if (input.publish) return { report: await publishLocked(q, user, rep), warnings: norm.warnings };
    return { report: rep, warnings: norm.warnings };
  });
}

async function publishLocked(q, user, rep) {
  const snapshot = { data: rep.data, teacher_id: rep.teacher_id };
  const changed = !rep.published || JSON.stringify(rep.published) !== JSON.stringify(snapshot);
  const row = (await q.query(
    `update reports set status = 'published', published = $2::jsonb, published_rev = published_rev + $3, published_at = case when $3 = 1 then now() else published_at end,
     published_by = case when $3 = 1 then $4 else published_by end, version = version + 1, updated_by = $4, updated_at = now() where id = $1 returning *`,
    [rep.id, j(snapshot), changed ? 1 : 0, user.username],
  )).rows[0];
  const out = rowToReport(row);
  await addRevision(q, out, 'publish', user.username);
  await audit(q, user.username, 'report', rep.id, 'publish', null, { published_rev: out.published_rev, changed });
  return out;
}

export async function publishReport(user, id, version) {
  const d = await db();
  const { assertCanEdit } = await import('./auth.js');
  return d.tx(async (q) => {
    const cur = await lockReport(q, id, version);
    assertCanEdit(user, cur);
    return publishLocked(q, user, cur);
  });
}

export async function unpublishReport(user, id, version) {
  const d = await db();
  const { assertCanEdit } = await import('./auth.js');
  return d.tx(async (q) => {
    const cur = await lockReport(q, id, version);
    assertCanEdit(user, cur);
    const row = (await q.query("update reports set status = 'draft', version = version + 1, updated_by = $2, updated_at = now() where id = $1 returning *", [id, user.username])).rows[0];
    const out = rowToReport(row);
    await addRevision(q, out, 'unpublish', user.username);
    await audit(q, user.username, 'report', id, 'unpublish', null, null);
    return out;
  });
}

export async function deleteReport(user, id) {
  const d = await db();
  return d.tx(async (q) => {
    const cur = await lockReport(q, id, null);
    if (cur.status === 'published') throw httpError(409, 'Жарияланған есепті өшіру мүмкін емес: алдымен жариялаудан алыңыз.', 'published');
    await q.query('delete from reports where id = $1', [id]);
    await audit(q, user.username, 'report', id, 'delete', cur, null);
    return { ok: true };
  });
}

export async function reportRevisions(id) {
  const d = await db();
  const { rows } = await d.query('select id, version, action, status, actor, at, teacher_id from report_revisions where report_id = $1 order by id desc limit 100', [id]);
  return rows;
}

/** Бұрынғы нұсқаны қалпына келтіру: ол жаңа нұсқа ретінде сақталады (тарих өшпейді). */
export async function restoreRevision(user, id, revId, version) {
  const d = await db();
  return d.tx(async (q) => {
    const cur = await lockReport(q, id, version);
    const rev = (await q.query('select * from report_revisions where id = $1 and report_id = $2', [revId, id])).rows[0];
    if (!rev) throw httpError(404, 'Нұсқа табылмады.');
    const data = cur.type === 'st' ? { ...rev.data, imported: rev.data.imported } : rev.data;
    const row = (await q.query('update reports set data = $2::jsonb, teacher_id = coalesce($3, teacher_id), version = version + 1, updated_by = $4, updated_at = now() where id = $1 returning *', [
      id, j(data), rev.teacher_id, user.username,
    ])).rows[0];
    const out = rowToReport(row);
    await addRevision(q, out, `restore:${revId}`, user.username);
    await audit(q, user.username, 'report', id, 'restore', { version: cur.version }, { from_revision: Number(revId) });
    return out;
  });
}

/** Импорт сияқты серверлік өзгерістер: fn(data) жаңа data қайтарады; бәрі бір транзакцияда. */
export async function mutateReportData(user, id, action, fn) {
  const d = await db();
  return d.tx(async (q) => {
    const cur = await lockReport(q, id, null);
    const next = await fn(JSON.parse(JSON.stringify(cur.data)), cur);
    const row = (await q.query('update reports set data = $2::jsonb, version = version + 1, updated_by = $3, updated_at = now() where id = $1 returning *', [id, j(next), user.username])).rows[0];
    const out = rowToReport(row);
    await addRevision(q, out, action, user.username);
    return out;
  });
}

/* ============================== «Таныстым» ============================== */

export async function acknowledge(user, reportId) {
  const d = await db();
  const rep = await getReport(reportId, d);
  if (!rep || rep.status !== 'published' || !rep.published_rev) throw httpError(404, 'Жарияланған есеп табылмады.');
  await d.query('insert into acknowledgements (user_id, report_id, published_rev) values ($1,$2,$3) on conflict do nothing', [user.id, reportId, rep.published_rev]);
  const { rows } = await d.query('select published_rev, at from acknowledgements where user_id = $1 and report_id = $2 order by published_rev desc limit 1', [user.id, reportId]);
  return { reportId, rev: rows[0].published_rev, at: rows[0].at, current: rep.published_rev };
}

export async function acksFor(userId, reportIds) {
  if (!userId || !reportIds.length) return {};
  const d = await db();
  const { rows } = await d.query('select report_id, max(published_rev) as rev, max(at) as at from acknowledgements where user_id = $1 and report_id = any($2::text[]) group by report_id', [userId, reportIds]);
  const out = {};
  rows.forEach((r) => { out[r.report_id] = { rev: Number(r.rev), at: r.at }; });
  return out;
}

export async function ackList(reportId) {
  const d = await db();
  const { rows } = await d.query(
    'select a.published_rev, a.at, u.display_name, u.username, u.role from acknowledgements a join users u on u.id = a.user_id where a.report_id = $1 order by a.at desc limit 500',
    [reportId],
  );
  return rows;
}

/* ============================== импорт баптаулары ============================== */

export async function getMapping(source, key) {
  const d = await db();
  const { rows } = await d.query('select value, updated_by, updated_at from import_mappings where source = $1 and key = $2', [source, key]);
  return rows[0] ? { ...rows[0].value, _meta: { updated_by: rows[0].updated_by, updated_at: rows[0].updated_at } } : null;
}

export async function setMapping(user, source, key, value) {
  const d = await db();
  return d.tx(async (q) => {
    const before = (await q.query('select value from import_mappings where source = $1 and key = $2', [source, key])).rows[0];
    const clean = { ...value };
    delete clean._meta;
    await q.query(
      'insert into import_mappings (source, key, value, updated_by, updated_at) values ($1,$2,$3::jsonb,$4, now()) on conflict (source, key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()',
      [source, key, j(clean), user.username],
    );
    await audit(q, user.username, 'import_mapping', `${source}:${key}`, 'update', before ? before.value : null, clean);
    return clean;
  });
}

export async function logImportRun(source, params, status, summary, actor) {
  const d = await db();
  const { rows } = await d.query('insert into import_runs (source, params, status, summary, actor) values ($1,$2::jsonb,$3,$4::jsonb,$5) returning id, at', [source, j(params), status, j(summary), actor]);
  return rows[0];
}

export async function importRuns(limit = 30) {
  const d = await db();
  const { rows } = await d.query('select * from import_runs order by id desc limit $1', [limit]);
  return rows;
}

export async function auditLog({ entity, entityId, limit = 200 } = {}) {
  const d = await db();
  const where = [], vals = [];
  if (entity) { vals.push(entity); where.push(`entity = $${vals.length}`); }
  if (entityId) { vals.push(entityId); where.push(`entity_id = $${vals.length}`); }
  vals.push(Math.min(500, limit));
  const { rows } = await d.query(`select * from audit ${where.length ? 'where ' + where.join(' and ') : ''} order by id desc limit $${vals.length}`, vals);
  return rows;
}

export { now };
