// Импорт: SapaLine (ЛС), JUZ40 платформасы (СТ), JSON резерві және Telegram мәтінін алдын ала бөлу.
// Әр әрекет алдымен «алдын ала қарау» (apply=false) ретінде жұмыс істейді: ештеңе сақталмай,
// әр есеп бойынша импорт есебі қайтады. apply=true — есеп жоба күйінде жаңарады (ешқашан автоматты
// жарияланбайды; жарияланған есепте «жарияланбаған өзгеріс» пайда болады).
import { route } from '../lib/route.js';
import { readBody, httpError } from '../lib/http.js';
import { requireUser, assertCanEdit } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { getCatalog, assignmentAt, getMapping, setMapping, logImportRun, createReport, mutateReportData, getReport, importRuns, ensurePeriod } from '../lib/repo.js';
import { sapalineConfig, sapalinePeriods, sapalineRows, sapalineDiscover } from '../lib/sapaline.js';
import { mergeLessons, norm } from '../lib/merge-ls.js';
import { mergePlatformResult } from '../lib/merge-st.js';
import { parseTelegram } from '../lib/telegram.js';

const EDITORS = ['admin', 'mentor'];

async function sapCfg() {
  // Әдепкі division: SapaLine веб-қосымшасының бөлімдер тізіміндегі SMART PRO slug-ы («smart_pro»).
  // Үш ағым бір division-да болса, ағымдар SapaLine «stream» коды бойынша ажыратылады (баптаудағы ағым кодтары).
  return (await getMapping('sapaline', 'config')) || { divisions: { sp1: 'smart_pro', sp2: 'smart_pro', sp3: 'smart_pro' }, agym: [], understandingKeys: {} };
}
async function platCfg() {
  return (await getMapping('platform', 'config')) || { courses: {}, groups: {}, hardTaskLimit: 10 };
}
const platformConfigured = () => !!process.env.JUZ40_LOGIN && !!process.env.JUZ40_PASSWORD;

async function findReport(type, streamId, subjectId, periodId) {
  const d = await db();
  const { rows } = await d.query("select id from reports where type = $1 and stream_id = $2 and coalesce(subject_id,'') = $3 and period_id = $4 and scope = 'all'", [type, streamId, subjectId || '', periodId]);
  return rows[0] ? getReport(rows[0].id) : null;
}

/** Импорттың мақсатты кезеңі (жоқ болса apply кезінде жасалады). */
async function targetPeriod(user, streamId, month, week, create) {
  const cat = await getCatalog();
  const p = cat.periods.find((x) => x.stream_id === streamId && x.kind === 'week' && x.month === Number(month) && x.week === Number(week));
  if (p || !create) return p || { id: null, stream_id: streamId, kind: 'week', month: Number(month), week: Number(week), label: `${month}-ай ${week}-апта` };
  const d = await db();
  return d.tx((q) => ensurePeriod(q, user, { stream_id: streamId, kind: 'week', month, week }));
}

async function importLs(user, b) {
  const cat = await getCatalog();
  const cfg = await sapCfg();
  const streamId = String(b.stream || '');
  if (!cat.streams.some((s) => s.id === streamId)) throw httpError(400, 'Ағым таңдалмаған.');
  const month = Number(b.month), week = Number(b.week);
  if (!(month >= 1 && week >= 1)) throw httpError(400, 'Мақсатты оқу айы мен аптасы керек.');
  const comboIds = new Set(cat.combinations.map((c) => c.id));
  const division = (cfg.divisions || {})[streamId] || '';
  const divisionIsStream = !!division && Object.entries(cfg.divisions || {}).filter(([, v]) => v === division).length === 1;
  const importedAt = new Date().toISOString();

  // Қай пәндер: SapaLine режимінде — таңдалғандар (немесе SapaLine коды бар барлық пән); JSON-да — payload.subject.
  let jobs = [];
  if (b.mode === 'json') {
    const p = b.payload && typeof b.payload === 'object' ? b.payload : null;
    if (!p || !Array.isArray(p.rows)) throw httpError(400, 'JSON-да «rows» тізімі жоқ. Бетбелгі не SapaLine экспортының пішімін қараңыз (README).', 'bad_import');
    const want = norm(b.subject || p.subject);
    const subj = cat.subjects.find((s) => s.id === b.subject) || cat.subjects.find((s) => [s.id, s.sapaline_code, s.name].some((v) => v && norm(v) === want));
    if (!subj) throw httpError(400, `Пән анықталмады («${p.subject || ''}»). Пәнді таңдаңыз немесе SapaLine кодын баптаңыз.`);
    jobs.push({ subject: subj, rows: p.rows, source: 'json', sourcePeriod: p.period || null });
  } else {
    if (!sapalineConfig().configured) throw httpError(503, 'SapaLine аккаунты бапталмаған (SAPALINE_EMAIL / SAPALINE_PASSWORD). JSON жолын қолданыңыз.', 'sapaline_not_configured');
    if (!division) throw httpError(400, 'Бұл ағымға SapaLine division мәні бапталмаған: Әкімші → Импорт баптауы.', 'sapaline_no_division');
    if (!b.sapalinePeriodId) throw httpError(400, 'SapaLine кезеңін таңдаңыз.');
    const wanted = Array.isArray(b.subjects) && b.subjects.length ? b.subjects : cat.subjects.filter((s) => s.sapaline_code).map((s) => s.id);
    for (const sid of wanted) {
      const subj = cat.subjects.find((s) => s.id === sid);
      if (!subj) continue;
      if (!subj.sapaline_code) { jobs.push({ subject: subj, error: 'SapaLine коды бапталмаған' }); continue; }
      try {
        const rows = await sapalineRows({ division, subjectCode: subj.sapaline_code, periodId: b.sapalinePeriodId, understandingKeys: cfg.understandingKeys });
        jobs.push({ subject: subj, rows, source: 'sapaline', sourcePeriod: String(b.sapalinePeriodId) });
      } catch (e) {
        jobs.push({ subject: subj, error: e.message });
      }
    }
    if (!jobs.length) throw httpError(400, 'SapaLine коды бапталған пән жоқ (Әкімші → Анықтамалық → Пәндер).');
  }

  const period = await targetPeriod(user, streamId, month, week, !!b.apply);
  const results = [];
  for (const job of jobs) {
    const res = { subjectId: job.subject.id, subject: job.subject.name };
    try {
      if (job.error) throw httpError(400, job.error);
      assertCanEdit(user, { type: 'ls', stream_id: streamId, subject_id: job.subject.id });
      const existing = period.id ? await findReport('ls', streamId, job.subject.id, period.id) : null;
      const a = existing ? null : assignmentAt(cat, streamId, job.subject.id, period.date_from);
      const teacherId = existing ? existing.teacher_id : a && a.teacher_id;
      const teacher = cat.teachers.find((t) => t.id === teacherId);
      if (!teacher) throw httpError(400, 'Бұл ағым мен пәнге мұғалім тағайындалмаған.');
      const merged = mergeLessons(existing && existing.data, job.rows, { streamId, teacher, config: cfg, comboIds, divisionIsStream, importedAt, source: job.source, sourcePeriod: job.sourcePeriod, actor: user.username });
      res.teacher = teacher.full_name;
      res.summary = merged.summary;
      res.reportId = existing ? existing.id : null;
      res.status = existing ? existing.status : 'new';
      if (b.apply) {
        let rep = existing;
        if (!rep) rep = (await createReport(user, { type: 'ls', stream_id: streamId, subject_id: job.subject.id, period: { id: period.id }, teacher_id: teacherId, data: {} })).report;
        const saved = await mutateReportData(user, rep.id, `import:${job.source}`, (cur) => {
          // Транзакция ішінде соңғы нұсқаға қайта біріктіреміз: импорт кезінде ментор сақтаса да ештеңе жоғалмайды.
          return mergeLessons(cur, job.rows, { streamId, teacher, config: cfg, comboIds, divisionIsStream, importedAt, source: job.source, sourcePeriod: job.sourcePeriod, actor: user.username }).data;
        });
        res.reportId = saved.id;
        res.version = saved.version;
        res.applied = true;
      }
    } catch (e) {
      res.error = e.message;
      if (e.details) res.details = e.details;
    }
    results.push(res);
  }
  const run = await logImportRun(b.mode === 'json' ? 'json' : 'sapaline', { stream: streamId, month, week, apply: !!b.apply, subjects: jobs.map((j) => j.subject.id) }, results.some((r) => r.error) ? (results.every((r) => r.error) ? 'failed' : 'partial') : 'ok', { results: results.map((r) => ({ subject: r.subjectId, error: r.error || null, lessons: r.summary && r.summary.lessons, warnings: r.summary ? r.summary.warnings.length : 0 })) }, user.username);
  return { period: { month, week, label: period.label, exists: !!period.id }, results, run };
}

async function importSt(user, b) {
  const cat = await getCatalog();
  const cfg = await platCfg();
  const streamId = String(b.stream || ''), subjectId = String(b.subject || '');
  const subj = cat.subjects.find((s) => s.id === subjectId);
  if (!subj || !cat.streams.some((s) => s.id === streamId)) throw httpError(400, 'Ағым мен пәнді таңдаңыз.');
  assertCanEdit(user, { type: 'st', stream_id: streamId, subject_id: subjectId });
  const month = Number(b.month), week = Number(b.week);
  if (!(month >= 1 && week >= 1)) throw httpError(400, 'Оқу айы мен аптасы керек.');
  const key = `${streamId}.${subjectId}`;
  const course = (cfg.courses || {})[key];
  let result;
  if (b.mode === 'json') {
    // Резерв: analysis жүйесінен не платформадан алынған PlatformResult пішіміндегі JSON.
    result = b.payload;
    if (!result || typeof result !== 'object' || !('score' in result)) throw httpError(400, 'JSON-да «score» жоқ: PlatformResult пішімін қараңыз (README).');
    result = { kind: 'st', month, week, groups: [], questionStats: [], tasks: [], topics: [], ...result };
  } else {
    if (!platformConfigured()) throw httpError(503, 'JUZ40 платформасының аккаунты бапталмаған (JUZ40_LOGIN / JUZ40_PASSWORD). JSON немесе қолмен енгізуді қолданыңыз.', 'platform_not_configured');
    if (!course || !course.courseId) throw httpError(400, `${subj.name} (${streamId}) үшін платформадағы курс таңдалмаған: Әкімші → Импорт баптауы.`);
    const { fetchTestResult } = await import('../lib/platform.js');
    try {
      result = await fetchTestResult(course.courseId, 'st', month, week);
    } catch (e) {
      throw httpError(502, 'Платформадан оқу сәтсіз: ' + e.message, 'platform_error');
    }
    if (!result) throw httpError(404, 'Платформада бұл аптаға СТ нәтижесі табылмады — бұрынғы деректер өзгертілмеді.', 'platform_empty');
  }
  const importedAt = new Date().toISOString();
  const ctx = { courseId: course ? course.courseId : 'json', groupMap: (cfg.groups || {})[key] || {}, importedAt, actor: user.username, limit: Number(cfg.hardTaskLimit) || 10 };
  const period = await targetPeriod(user, streamId, month, week, !!b.apply);
  const existing = period.id ? await findReport('st', streamId, subjectId, period.id) : null;
  const merged = mergePlatformResult(existing && existing.data, result, ctx);
  const out = { period: { label: period.label, exists: !!period.id }, reportId: existing ? existing.id : null, status: existing ? existing.status : 'new', summary: merged.summary };
  if (b.apply) {
    let rep = existing;
    if (!rep) rep = (await createReport(user, { type: 'st', stream_id: streamId, subject_id: subjectId, period: { id: period.id }, data: {} })).report;
    const saved = await mutateReportData(user, rep.id, `import:${b.mode === 'json' ? 'json' : 'platform'}`, (cur) => mergePlatformResult(cur, result, ctx).data);
    out.reportId = saved.id;
    out.version = saved.version;
    out.applied = true;
  }
  out.run = await logImportRun(b.mode === 'json' ? 'platform-json' : 'platform', { stream: streamId, subject: subjectId, month, week, apply: !!b.apply }, 'ok', { score: merged.summary.score, warnings: merged.summary.warnings.length }, user.username);
  return out;
}

export default route({
  async GET(req) {
    const user = await requireUser(req, EDITORS);
    const [sap, plat] = await Promise.all([sapCfg(), platCfg()]);
    return {
      sapaline: { configured: sapalineConfig().configured, config: sap },
      platform: { configured: platformConfigured(), config: plat },
      runs: await importRuns(20),
      role: user.role,
    };
  },
  async POST(req, res, q) {
    const action = q.get('action');
    const b = await readBody(req, 4_000_000);
    if (action === 'config-sapaline' || action === 'config-platform') {
      const user = await requireUser(req, ['admin']);
      const v = b.config && typeof b.config === 'object' ? b.config : {};
      return { config: await setMapping(user, action === 'config-sapaline' ? 'sapaline' : 'platform', 'config', v) };
    }
    if (action === 'sapaline-discover') {
      await requireUser(req, ['admin']);
      return sapalineDiscover({ division: b.division ? String(b.division) : null, periodId: b.periodId || null });
    }
    if (action === 'platform-subjects') {
      await requireUser(req, ['admin']);
      if (!platformConfigured()) throw httpError(503, 'JUZ40_LOGIN / JUZ40_PASSWORD бапталмаған.', 'platform_not_configured');
      const { listSubjects } = await import('../lib/platform.js');
      try {
        return { subjects: await listSubjects() };
      } catch (e) {
        throw httpError(502, e.message, 'platform_error');
      }
    }
    if (action === 'platform-courses') {
      await requireUser(req, ['admin']);
      if (!platformConfigured()) throw httpError(503, 'JUZ40_LOGIN / JUZ40_PASSWORD бапталмаған.', 'platform_not_configured');
      const { listCourses } = await import('../lib/platform.js');
      try {
        return { courses: await listCourses(String(b.code || '')) };
      } catch (e) {
        throw httpError(502, e.message, 'platform_error');
      }
    }
    const user = await requireUser(req, EDITORS);
    if (action === 'sapaline-periods') {
      const cfg = await sapCfg();
      return { periods: await sapalinePeriods((cfg.divisions || {})[String(b.stream || '')]) };
    }
    if (action === 'ls') return importLs(user, b);
    if (action === 'st') return importSt(user, b);
    if (action === 'platform-tests') {
      const cfg = await platCfg();
      const course = (cfg.courses || {})[`${b.stream}.${b.subject}`];
      if (!platformConfigured()) throw httpError(503, 'JUZ40_LOGIN / JUZ40_PASSWORD бапталмаған.', 'platform_not_configured');
      if (!course) throw httpError(400, 'Бұл ағым мен пәнге платформадағы курс таңдалмаған.');
      const { discoverTests } = await import('../lib/platform.js');
      try {
        const { tests } = await discoverTests(course.courseId);
        return { tests: tests.filter((t) => t.kind === 'st') };
      } catch (e) {
        throw httpError(502, e.message, 'platform_error');
      }
    }
    if (action === 'telegram') {
      const cat = await getCatalog();
      if (!['ls', 'st', 'bt'].includes(b.type)) throw httpError(400, 'Есеп түрін таңдаңыз.');
      return parseTelegram(String(b.text || ''), b.type, cat);
    }
    throw httpError(400, 'Белгісіз импорт әрекеті.');
  },
});
