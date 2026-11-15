import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { tempDbDir, call, api } from './helpers.mjs';

const DIR = tempDbDir();
process.env.LOCAL_DB_DIR = DIR;
process.env.BOOTSTRAP_ADMIN_USERNAME = 'boss';
process.env.BOOTSTRAP_ADMIN_PASSWORD = 'boss-password-1';
process.env.SESSION_SECRET = 'test-secret-0123456789';
delete process.env.PUBLIC_VIEW;

let A, admin, mentor, viewer, viewer2;

async function login(username, password) {
  const r = await call(A.session, { method: 'POST', body: { username, password } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.cookie;
}

before(async () => {
  A = await api();
  admin = await login('boss', 'boss-password-1');
  for (const [u, role] of [['mentor1', 'mentor'], ['viewer1', 'viewer'], ['viewer2', 'viewer'], ['mentor_sp3', 'mentor']]) {
    const r = await call(A.users, { method: 'POST', cookie: admin, body: { username: u, displayName: u, role, password: 'password-' + u, scope: u === 'mentor_sp3' ? { streams: ['sp3'] } : {} } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  mentor = await login('mentor1', 'password-mentor1');
  viewer = await login('viewer1', 'password-viewer1');
  viewer2 = await login('viewer2', 'password-viewer2');
});

test('анықтамалық: 16 пән, 3 ағым, 48 тағайындау, геометрия бөлек, TOEFL — Амирбекова Ажар', async () => {
  const r = await call(A.catalog, { cookie: viewer });
  assert.equal(r.status, 200);
  const c = r.body;
  assert.equal(c.subjects.length, 16);
  assert.equal(c.streams.length, 3);
  assert.equal(c.assignments.length, 48);
  assert.ok(c.subjects.some((s) => s.id === 'geometry') && c.subjects.some((s) => s.id === 'math'));
  assert.ok(!c.subjects.some((s) => /англ/i.test(s.name)));
  const t = new Map(c.teachers.map((x) => [x.id, x.full_name]));
  const toefl = c.assignments.filter((a) => a.subject_id === 'toefl');
  assert.equal(toefl.length, 3);
  assert.ok(toefl.every((a) => t.get(a.teacher_id) === 'Амирбекова Ажар'));
  for (const s of ['sp1', 'sp2', 'sp3']) {
    const m = c.assignments.find((a) => a.stream_id === s && a.subject_id === 'math');
    const g = c.assignments.find((a) => a.stream_id === s && a.subject_id === 'geometry');
    assert.equal(m.teacher_id, g.teacher_id); // геометрияны сол ағымның математика мұғалімі береді
    assert.notEqual(m.id, g.id);
  }
  // Екі Әділет — екі бөлек адам
  const adilet = c.teachers.filter((x) => /Әділет/.test(x.full_name));
  assert.equal(adilet.length, 2);
  // бір адам — бір профиль
  assert.equal(new Set(c.teachers.map((x) => x.full_name)).size, c.teachers.length);
  assert.equal(c.teachers.length, 26);
});

test('рөлдер серверде тексеріледі', async () => {
  assert.equal((await call(A.catalog, {})).status, 401); // кірмеген адам
  assert.equal((await call(A.reports, { cookie: viewer })).status, 403);
  assert.equal((await call(A.reports, { method: 'POST', cookie: viewer, body: { type: 'ls' } })).status, 403);
  assert.equal((await call(A.catalog, { method: 'POST', cookie: mentor, body: { kind: 'subjects', item: { name: 'X', short: 'X' } } })).status, 403);
  assert.equal((await call(A.users, { cookie: mentor })).status, 403);
  // шектелген ментор басқа ағымға жаза алмайды
  const m3 = await login('mentor_sp3', 'password-mentor_sp3');
  const r = await call(A.reports, { method: 'POST', cookie: m3, body: { type: 'ls', stream_id: 'sp1', subject_id: 'physics', period: { month: 1, week: 1 } } });
  assert.equal(r.status, 403);
});

let lsId;
test('ЛС есебі: жасау, қатар сақтаудан қорғаныс, жариялау, нұсқалар', async () => {
  const data = { lessons: [{ sourceId: 'sap-1', source: 'sapaline', combos: ['c_bh', 'c_fh'], present: 56, total: 61, liked: 46, avg: 0, disliked: 0, understanding: { u90: 45, u80: 1, u70: 0, u60: 0, u50: 0, u0: 0 } }], mentor: { summary: 'Жақсы сабақ', nextSteps: '- Тақырыпты бекіту' } };
  const c = await call(A.reports, { method: 'POST', cookie: mentor, body: { type: 'ls', stream_id: 'sp1', subject_id: 'chemistry', period: { month: 5, week: 2 }, data } });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const rep = c.body.report;
  lsId = rep.id;
  assert.equal(rep.teacher_id, 't_sansyzbaeva_zhanar');
  assert.equal(rep.status, 'draft');
  // көруші жобаны көрмейді
  let v = await call(A.view, { cookie: viewer, url: '/api/view?type=ls&stream=sp1&subject=chemistry' });
  assert.equal(v.body.entries.length, 0);
  // екі ментор бір нұсқадан сақтайды: екіншісі 409 алады
  const s1 = await call(A.reports, { method: 'PUT', cookie: mentor, body: { id: rep.id, version: rep.version, data: { ...data, mentor: { summary: 'A', nextSteps: '' } } } });
  assert.equal(s1.status, 200);
  const s2 = await call(A.reports, { method: 'PUT', cookie: admin, body: { id: rep.id, version: rep.version, data: { ...data, mentor: { summary: 'B', nextSteps: '' } } } });
  assert.equal(s2.status, 409);
  assert.equal(s2.body.current.data.mentor.summary, 'A');
  // жариялау
  const p = await call(A.reports, { method: 'POST', url: '/api/reports?action=publish', cookie: mentor, body: { id: rep.id, version: s1.body.report.version } });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal(p.body.report.published_rev, 1);
  v = await call(A.view, { cookie: viewer, url: '/api/view?type=ls&stream=sp1&subject=chemistry' });
  assert.equal(v.body.entries.length, 1);
  const e = v.body.entries[0];
  assert.equal(Math.round(e.metrics.attendance.pct * 100) / 100, 91.8);
  assert.equal(e.metrics.like.pct, 100);
  assert.equal(e.dynamics.status, 'no_prev_period');
  // мазмұн өзгеріп қайта жарияланса — жаңа жарияланған нұсқа
  const cur = (await call(A.reports, { cookie: mentor, url: `/api/reports?id=${rep.id}` })).body.report;
  const u = await call(A.reports, { method: 'PUT', cookie: mentor, body: { id: rep.id, version: cur.version, data: { ...cur.data, mentor: { summary: 'Түзетілді', nextSteps: '' } }, publish: true } });
  assert.equal(u.status, 200, JSON.stringify(u.body));
  assert.equal(u.body.report.published_rev, 2);
  v = await call(A.view, { cookie: viewer, url: '/api/view?type=ls&stream=sp1&subject=chemistry' });
  assert.equal(v.body.entries[0].publishedRev, 2);
  // көруші өзгерте алмайды
  assert.equal((await call(A.reports, { method: 'PUT', cookie: viewer, body: { id: rep.id, version: 1, data: {} } })).status, 403);
});

test('динамика: ай шекарасы, алдыңғы апта бос болса «дерек жоқ», 0 ≠ жоқ', async () => {
  // SP-2 Химия: 4-ай 4-апта және 5-ай 1-апта
  const mk = async (month, week, liked, total) => {
    const r = await call(A.reports, { method: 'POST', cookie: mentor, body: { type: 'ls', stream_id: 'sp2', subject_id: 'chemistry', period: { month, week }, data: { lessons: [{ combos: ['c_bh'], present: total, total, liked, avg: 100 - liked, disliked: 0 }] } } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const p = await call(A.reports, { method: 'POST', url: '/api/reports?action=publish', cookie: mentor, body: { id: r.body.report.id, version: r.body.report.version } });
    assert.equal(p.status, 200);
    return p.body.report;
  };
  await mk(4, 4, 96, 50);
  await mk(5, 1, 98, 50);
  let v = await call(A.view, { cookie: viewer, url: '/api/view?type=ls&stream=sp2&subject=chemistry&period=5-1' });
  const d = v.body.entries[0].dynamics;
  assert.equal(d.status, 'ok');
  assert.equal(d.prevPeriod.label, '4-ай 4-апта');
  assert.equal(Math.round(d.like.diff * 1e6) / 1e6, 2);
  assert.equal(d.like.good, true);
  // 5-ай 2-апта кезеңін басқа пән үшін жасаймыз, ал химияның 5-ай 3-аптасы бар — 5-ай 2-апта химиясы жоқ
  await call(A.reports, { method: 'POST', cookie: mentor, body: { type: 'ls', stream_id: 'sp2', subject_id: 'physics', period: { month: 5, week: 2 }, data: {} } });
  await mk(5, 3, 90, 50);
  v = await call(A.view, { cookie: viewer, url: '/api/view?type=ls&stream=sp2&subject=chemistry&period=5-3' });
  assert.equal(v.body.entries[0].dynamics.status, 'no_prev_data');
  assert.equal(v.body.entries[0].dynamics.prevPeriod.label, '5-ай 2-апта');
});

test('СТ: салмақталған жалпы балл, қайта тапсыру төмендесе жақсару, комбинация мен жалпы шатаспайды', async () => {
  const mk = async (month, week, combos) => {
    const r = await call(A.reports, { method: 'POST', cookie: mentor, body: { type: 'st', stream_id: 'sp2', subject_id: 'chemistry', period: { month, week }, data: { combos } } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    await call(A.reports, { method: 'POST', url: '/api/reports?action=publish', cookie: mentor, body: { id: r.body.report.id, version: r.body.report.version } });
  };
  await mk(3, 4, [{ comboId: 'c_bh', score: 18, max: 20, submitted: 30, retakeCount: 21, retakeBase: 50 }, { comboId: 'c_fh', score: 19, max: 20, submitted: 10, retakeCount: 2, retakeBase: 10 }]);
  await mk(4, 1, [{ comboId: 'c_bh', score: 16, max: 20, submitted: 30, retakeCount: 15, retakeBase: 50 }, { comboId: 'c_fh', score: 17, max: 20, submitted: 10, retakeCount: 2, retakeBase: 10 }]);
  let v = await call(A.view, { cookie: viewer, url: '/api/view?type=st&stream=sp2&subject=chemistry&period=4-1' });
  const e = v.body.entries[0];
  assert.equal(e.metrics.source, 'weighted');
  assert.equal(e.metrics.score, (16 * 30 + 17 * 10) / 40);
  assert.equal(e.dynamics.score.unit, 'pt');
  assert.equal(Math.round(e.dynamics.score.diff * 100) / 100, -2);
  // комбинация деңгейі
  v = await call(A.view, { cookie: viewer, url: '/api/view?type=st&stream=sp2&subject=chemistry&period=4-1&combo=c_bh' });
  const b = v.body.entries[0];
  assert.equal(b.metrics.score, 16);
  assert.equal(b.dynamics.score.diff, -2);
  assert.equal(b.metrics.retake.pct, 30);
  assert.equal(b.dynamics.retake.diff, -12);
  assert.equal(b.dynamics.retake.good, true); // 42% → 30% — жақсару
});

test('қайта импорт сандарды жаңартады, ментор пікірін өшірмейді, бос импорт ештеңе өзгертпейді', async () => {
  const cfg = { divisions: { sp3: 'smart_pro_3' }, agym: [{ agym: 'SP3-БХ', stream: 'sp3', combos: ['c_bh'] }, { agym: 'SP3-ФХ', stream: 'sp3', combos: ['c_fh'] }] };
  assert.equal((await call(A.import, { method: 'POST', url: '/api/import?action=config-sapaline', cookie: admin, body: { config: cfg } })).status, 200);
  const payload = { source: 'sapaline', v: 2, subject: 'chemistry', period: '2-АЙ 1-АПТА', rows: [
    { num: '101', date: '2026-11-02', teacher: 'Қазбеков Дамир', agym: 'SP3-БХ', present: 20, total: 22, survey: { liked: 15, avg: 2, disliked: 0 } },
    { num: '101', date: '2026-11-02', teacher: 'Қазбеков Дамир', agym: 'SP3-БХ', present: 99, total: 99 },
    { num: '102', date: '2026-11-03', teacher: 'Дамир Қазбеков', agym: 'SP3-ФХ', present: 10, total: 10, survey: { liked: 8, avg: 1, disliked: 1 } },
    { num: '103', date: '2026-11-03', teacher: 'Бөтен Адам', agym: 'SP3-ФХ', present: 5, total: 5 },
  ] };
  const pre = await call(A.import, { method: 'POST', url: '/api/import?action=ls', cookie: mentor, body: { mode: 'json', stream: 'sp3', month: 2, week: 1, payload } });
  assert.equal(pre.status, 200, JSON.stringify(pre.body));
  const r0 = pre.body.results[0];
  assert.equal(r0.summary.lessons, 2);
  assert.ok(r0.summary.warnings.some((w) => /екі рет/.test(w)));
  assert.equal(r0.summary.skipped.length, 1);
  assert.equal(r0.applied, undefined);
  const ap = await call(A.import, { method: 'POST', url: '/api/import?action=ls', cookie: mentor, body: { mode: 'json', stream: 'sp3', month: 2, week: 1, payload, apply: true } });
  const id = ap.body.results[0].reportId;
  let rep = (await call(A.reports, { cookie: mentor, url: `/api/reports?id=${id}` })).body.report;
  assert.equal(rep.data.lessons.length, 2);
  // ментор пікір жазады
  const sv = await call(A.reports, { method: 'PUT', cookie: mentor, body: { id, version: rep.version, data: { ...rep.data, mentor: { summary: 'Ментор пікірі', nextSteps: 'Ұсыныс' }, difficulties: [{ text: 'Тотығу дәрежесі қиын' }] } } });
  assert.equal(sv.status, 200, JSON.stringify(sv.body));
  // қайта импорт: 101-сабақтың саны өзгерген
  payload.rows[0].present = 21;
  await call(A.import, { method: 'POST', url: '/api/import?action=ls', cookie: mentor, body: { mode: 'json', stream: 'sp3', month: 2, week: 1, payload, apply: true } });
  rep = (await call(A.reports, { cookie: mentor, url: `/api/reports?id=${id}` })).body.report;
  assert.equal(rep.data.lessons.length, 2);
  assert.equal(rep.data.lessons.find((l) => l.sourceId === '101').present, 21);
  assert.equal(rep.data.mentor.summary, 'Ментор пікірі');
  assert.equal(rep.data.difficulties[0].text, 'Тотығу дәрежесі қиын');
  // бос импорт қабылданбайды
  const empty = await call(A.import, { method: 'POST', url: '/api/import?action=ls', cookie: mentor, body: { mode: 'json', stream: 'sp3', month: 2, week: 1, payload: { subject: 'chemistry', rows: [] }, apply: true } });
  assert.match(empty.body.results[0].error, /бос/);
  const after = (await call(A.reports, { cookie: mentor, url: `/api/reports?id=${id}` })).body.report;
  assert.equal(after.version, rep.version);
});

test('БТ: бір жалпы есеп, пәндік нәтиже мұғаліммен байланысады, ОС сияқты қосымша көрсеткіш', async () => {
  const r = await call(A.reports, { method: 'POST', cookie: mentor, body: { type: 'bt', stream_id: 'sp1', scope: 'c_bh', period: { test_date: '2026-11-08' }, data: {
    participants: 40, overall: { avg: 92.5, max: 140 }, top3: [{ name: 'Оқушы А', score: 120 }, { name: 'Оқушы Б', score: 120 }, { name: 'Оқушы В', score: 110 }],
    subjects: [{ subjectId: 'chemistry', avg: 31.2, max: 50, top3: [{ name: 'Оқушы А', score: 45 }], hardTopics: ['Электролиз'] }, { label: 'ОС', avg: 7.1, max: 10 }],
  } } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await call(A.reports, { method: 'POST', url: '/api/reports?action=publish', cookie: mentor, body: { id: r.body.report.id, version: r.body.report.version } });
  const v = await call(A.view, { cookie: viewer, url: '/api/view?type=bt&stream=sp1' });
  assert.equal(v.body.bt.length, 1);
  const b = v.body.bt[0];
  assert.equal(b.subjects.find((s) => s.subjectId === 'chemistry').teacher.name, 'Сансызбаева Жанар');
  assert.equal(b.subjects.find((s) => s.label === 'ОС').teacher, null);
  assert.deepEqual(b.top3.map((x) => x.rank), [1, 1, 3]);
  assert.equal(b.dynamics.status, 'no_prev_bt');
});

test('Telegram мәтінін бөлу тек жоба береді', async () => {
  const text = 'SMART PRO-1, 5-ай 2-апта\nХимия — БХ, ФХ\nСансызбаева Жанар\nҚатысым: 56/61\nҰнады: 46\nОрташа: 0\nҰнамады: 0\n90-100% түсінді: 45\n80-90%: 1';
  const r = await call(A.import, { method: 'POST', url: '/api/import?action=telegram', cookie: mentor, body: { type: 'ls', text } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const d = r.body.draft;
  assert.equal(d.stream_id, 'sp1');
  assert.equal(d.subject_id, 'chemistry');
  assert.deepEqual(d.period, { month: 5, week: 2 });
  assert.equal(d.data.lessons[0].present, 56);
  assert.equal(d.data.lessons[0].liked, 46);
  assert.equal(d.data.lessons[0].understanding.u90, 45);
  assert.equal(d.data.lessons[0].understanding.u80, 1);
  assert.equal(d.data.lessons[0].avg, 0);
});

test('өзгерістер тарихы және қалпына келтіру', async () => {
  const revs = await call(A.reports, { cookie: mentor, url: `/api/reports?id=${lsId}&revisions=1` });
  assert.ok(revs.body.revisions.length >= 3);
  const first = revs.body.revisions[revs.body.revisions.length - 1];
  const cur = (await call(A.reports, { cookie: admin, url: `/api/reports?id=${lsId}` })).body.report;
  assert.equal((await call(A.reports, { method: 'POST', url: '/api/reports?action=restore', cookie: mentor, body: { id: lsId, revisionId: first.id, version: cur.version } })).status, 403);
  const r = await call(A.reports, { method: 'POST', url: '/api/reports?action=restore', cookie: admin, body: { id: lsId, revisionId: first.id, version: cur.version } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.report.data.mentor.summary, 'Жақсы сабақ');
  const audit = await call(A.audit, { cookie: admin });
  assert.ok(audit.body.audit.length > 5);
});
