// SapaLine адаптері жалған Supabase серверімен: кіру, тек оқу сұраныстары, баптаудағы division/пән кодтары.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

test('SapaLine: баптаудағы division мен пән кодымен оқиды, сауалнама мен қатысымды шығарады', async () => {
  const seen = [];
  const srv = http.createServer((req, res) => {
    seen.push(req.method + ' ' + decodeURIComponent(req.url));
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/auth/v1/token')) return res.end(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
    if (req.headers.authorization !== 'Bearer tok') { res.statusCode = 401; return res.end('{}'); }
    if (req.url.startsWith('/rest/v1/live_sabaq_periods')) return res.end(JSON.stringify([{ id: 7, month: 5, week: 2 }, { id: 6, month: 5, week: 1 }]));
    if (req.url.startsWith('/rest/v1/live_sabaq_rows')) return res.end(JSON.stringify([{ id: 11, lesson_date: '2026-11-10', time_from: '10:00:00', teacher: 'Сансызбаева Жанар', stream: 'SP1-БХ', survey_auto: { unady: 40, ortasha: 0, unamady: 0, qatysty: 50, jalpy: 55, t90: 30 }, survey: { unady: 46 } }]));
    res.statusCode = 404; res.end('[]');
  });
  await new Promise((r) => srv.listen(0, r));
  process.env.SAPALINE_URL = 'http://127.0.0.1:' + srv.address().port;
  process.env.SAPALINE_EMAIL = 'svc@example.com';
  process.env.SAPALINE_PASSWORD = 'x';
  const m = await import('../lib/sapaline.js');
  m.resetSapalineToken();
  const periods = await m.sapalinePeriods('smart_pro_1');
  assert.equal(periods[0].label, '5-ай 2-апта');
  const rows = await m.sapalineRows({ division: 'smart_pro_1', subjectCode: 'chemistry', periodId: 7, understandingKeys: { u90: 't90' } });
  assert.deepEqual(rows[0].survey, { liked: 46, avg: 0, disliked: 0 }); // қолмен түзетілген survey басым
  assert.equal(rows[0].present, 50);
  assert.equal(rows[0].total, 55);
  assert.equal(rows[0].understanding.u90, 30);
  assert.ok(seen.some((s) => s.includes('division=eq.smart_pro_1') && s.includes('subject=eq.chemistry') && s.includes('period_id=eq.7')));
  assert.ok(seen.filter((s) => s.startsWith('POST')).every((s) => s.includes('/auth/v1/token'))); // жалғыз POST — кіру
  srv.close();
});
