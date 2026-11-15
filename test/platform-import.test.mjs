// СТ импорты жалған JUZ40 платформасынан толық жолмен: топтардың орташасы, жауап нұсқалары (кім не таңдады),
// дұрыс жауап, LaTeX мәтін, ішке салынған сурет сақталып /api/photo?img= арқылы беріледі.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { tempDbDir, call, api } from './helpers.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = `x.${b64({ exp: Math.floor(Date.now() / 1000) + 3600 })}.y`;
let srv, A, admin;

// 2 топ: Г1 — 6 оқушы (балл 10), Г2 — 5 оқушы (балл 20) → топтардың орташасы 15 (оқушылар бойынша 14,55 болар еді)
const students = [...Array(11)].map((_, i) => ({ id: 's' + i, group: i < 6 ? 'g1' : 'g2', score: i < 6 ? 10 : 20, pick: i < 7 ? 'a2' : 'a1' }));
function progresses(group) {
  return students.filter((s) => s.group === group).map((s) => ({
    status: 'SUCCESS', score: s.score, studentId: s.id, studentFirstname: 'Оқушы', studentLastname: s.id,
    quizQuestionIds: ['q1', 'q2'],
    questionPassingDtos: [
      { questionId: 'q1', score: s.pick === 'a1' ? 1 : 0, maxScore: 1, userAnswers: [{ answerId: s.pick }] },
      { questionId: 'q2', score: 1, maxScore: 1, userAnswers: [{ answerId: 'b1' }] },
    ],
  }));
}

before(async () => {
  srv = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const u = req.url;
    const send = (o) => res.end(JSON.stringify(o));
    if (u === '/v1/auth/signin') return send({ token, roles: ['HEAD_TEACHER'] });
    if (req.headers.authorization !== 'Bearer ' + token) { res.statusCode = 401; return send({}); }
    if (u === '/v1/headteacher/courses/C1/groups') return send([{ id: 'g1', name: 'Г1', curator: { firstname: 'Айгүл', lastname: 'Бір' } }, { id: 'g2', name: 'Г2', curator: { firstname: 'Ерлан', lastname: 'Екі' } }]);
    if (/^\/v1\/headteacher\/groups\/g[12]\/themes\?month=4&week=1$/.test(u)) return send({ themes: [{ themeId: 't1', themeName: 'САБАҚ ТАПСЫРУ', month: 4, week: 1 }] });
    if (/^\/v1\/headteacher\/groups\/g[12]\/themes/.test(u)) return send({ themes: [] });
    if (/^\/v3\/headteacher\/groups\/g[12]\/themes\/t1\/lessons\/summary$/.test(u)) return send([{ id: 'L1', name: 'Химия СТ 4.1', rating: true, ratingTaskType: 'SABAK_TAPSYRU', maxScore: 20 }]);
    const pm = /^\/v2\/headteacher\/groups\/(g[12])\/lessons\/L1\/progresses$/.exec(u);
    if (pm) return send(progresses(pm[1]));
    if (u === '/v1/lessons/L1/info') return send({ variants: [{ variantedLessonId: 'V1', variant: 1 }] });
    if (u === '/v1/lessons/V1') return send({ questions: [
      { id: 'q1', quizQuestionType: 'SINGLE', score: 1, questionText: `<p>Тізбектегі В заты: Zn(NO3)2 → A $$кокс,\\hspace{0.222em}t°C\\rightarrow$$ B</p><img src="data:image/png;base64,${PNG}">`,
        answerList: [{ id: 'a1', answerText: 'Zn', correct: true }, { id: 'a2', answerText: '<p>ZnO</p>', correct: false }, { id: 'a3', answerText: 'Na<sub>2</sub>ZnO<sub>2</sub>', correct: false }] },
      { id: 'q2', quizQuestionType: 'SINGLE', score: 1, questionText: 'Жеңіл сұрақ', answerList: [{ id: 'b1', answerText: 'иә', correct: true }, { id: 'b2', answerText: 'жоқ', correct: false }] },
    ] });
    res.statusCode = 404; send({});
  });
  await new Promise((r) => srv.listen(0, r));
  process.env.JUZ40_API_URL = 'http://127.0.0.1:' + srv.address().port;
  process.env.JUZ40_LOGIN = 'ht';
  process.env.JUZ40_PASSWORD = 'pw';
  process.env.LOCAL_DB_DIR = tempDbDir();
  process.env.BOOTSTRAP_ADMIN_USERNAME = 'boss';
  process.env.BOOTSTRAP_ADMIN_PASSWORD = 'boss-password-1';
  process.env.SESSION_SECRET = 'test-secret-0123456789';
  A = await api();
  admin = (await call(A.session, { method: 'POST', body: { username: 'boss', password: 'boss-password-1' } })).cookie;
  const cfg = await call(A.import, { method: 'POST', url: '/api/import?action=config-platform', cookie: admin, body: { config: { courses: { 'sp1.chemistry': [{ courseId: 'C1', courseName: 'SP-1 Химия' }] } } } });
  assert.equal(cfg.status, 200, JSON.stringify(cfg.body));
});
after(() => srv && srv.close());

test('СТ импорты: топтардың орташасы, нұсқалар мен таңдаулар, LaTeX, ішкі сурет', async () => {
  const r = await call(A.import, { method: 'POST', url: '/api/import?action=st', cookie: admin, body: { stream: 'sp1', subject: 'chemistry', month: 4, week: 1, apply: true } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.summary.score, 15);
  assert.equal(r.body.images, 1);
  const rep = (await call(A.reports, { cookie: admin, url: `/api/reports?id=${r.body.reportId}` })).body.report;
  const t = rep.data.hardTasks[0];
  assert.match(t.text, /\$\$кокс/); // LaTeX сақталды — бетте KaTeX сызады
  assert.equal(t.wrongPct, 63.64); // 7 / 11, 2 ондық таңбаға дейін
  assert.deepEqual(t.options.map((o) => [o.correct, o.picks]), [[true, 4], [false, 7], [false, 0]]);
  assert.equal(t.options[2].html, 'Na<sub>2</sub>ZnO<sub>2</sub>');
  assert.equal(t.answered, 11);
  assert.match(t.images[0], /^\/api\/photo\?img=[a-f0-9]+$/);
  const img = await call(A.photo, { url: t.images[0] });
  assert.equal(img.status, 200);
  assert.equal(img.headers['content-type'], 'image/png');
  // ментор түсіндірме жазады, қайта импорт оны өшірмейді, таңдаулар жаңарады
  t.explanation = 'Цинк оксиді кокспен тотықсызданады';
  const sv = await call(A.reports, { method: 'PUT', cookie: admin, body: { id: rep.id, version: rep.version, data: rep.data } });
  assert.equal(sv.status, 200, JSON.stringify(sv.body));
  await call(A.import, { method: 'POST', url: '/api/import?action=st', cookie: admin, body: { stream: 'sp1', subject: 'chemistry', month: 4, week: 1, apply: true } });
  const again = (await call(A.reports, { cookie: admin, url: `/api/reports?id=${rep.id}` })).body.report;
  assert.equal(again.data.hardTasks[0].explanation, 'Цинк оксиді кокспен тотықсызданады');
  assert.equal(again.data.hardTasks[0].options[1].picks, 7);
});
