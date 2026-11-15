// JUZ40 платформасының адаптері жалған API серверімен: кіру, рөл тексеру, пәндер мен курстар.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

function b64(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }

test('платформа: HEAD_TEACHER-мен кіреді, пәндер мен курстарды оқиды, тек GET', async () => {
  const seen = [];
  let roles = ['HEAD_TEACHER'];
  const token = `x.${b64({ exp: Math.floor(Date.now() / 1000) + 3600 })}.y`;
  const srv = http.createServer((req, res) => {
    seen.push(req.method + ' ' + req.url);
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/auth/signin') return res.end(JSON.stringify({ token, roles }));
    if (req.headers.authorization !== 'Bearer ' + token) { res.statusCode = 401; return res.end('{}'); }
    if (req.url === '/v1/headteacher/subjects') return res.end(JSON.stringify([{ id: 's1', shortName: 'ХИМ', nameKz: 'Химия' }, { id: 's2', shortName: 'ГЕОМ', nameKz: 'Геометрия' }]));
    if (req.url === '/v1/headteacher/subjects/s1/courses') return res.end(JSON.stringify([{ id: 'c9', name: 'SMART PRO-1 Химия', year: 2026, month: 9, active: true }]));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((r) => srv.listen(0, r));
  process.env.JUZ40_API_URL = 'http://127.0.0.1:' + srv.address().port;
  process.env.JUZ40_LOGIN = 'ht';
  process.env.JUZ40_PASSWORD = 'pw';
  const p = await import('../lib/platform.js');
  const subs = await p.listSubjects();
  assert.deepEqual(subs.map((s) => s.shortName), ['ХИМ', 'ГЕОМ']);
  const courses = await p.listCourses('хим');
  assert.equal(courses[0].id, 'c9');
  await assert.rejects(() => p.listCourses('ФИЗ'), /табылмады/);
  assert.ok(seen.filter((s) => !s.startsWith('GET')).every((s) => s === 'POST /v1/auth/signin'));
  srv.close();
});
