import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lsAggregate, stOverall, stRetakeOverall, retakeOf, delta, scoreDelta, previousWeek, rankTop, fmtDelta, fmtPct, toNum } from '../lib/calc.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('ЛС үлгісі: Химия SP-1 5-ай 2-апта — қатысым 56/61, ұнату 100%', () => {
  const lessons = [{ sourceId: 'L1', combos: ['c_bh', 'c_fh'], present: 56, total: 61, liked: 46, avg: 0, disliked: 0, understanding: { u90: 45, u80: 1, u70: 0, u60: 0, u50: 0, u0: 0 } }];
  const a = lsAggregate(lessons, null);
  near(a.attendance.pct, (56 / 61) * 100);
  assert.equal(fmtPct(a.attendance.pct), '91,8%');
  assert.equal(a.like.pct, 100);
  assert.equal(a.like.responses, 46); // 56 қатысқанның бәрі жауап берді деп саналмайды
  assert.equal(a.understanding.counts.u90, 45);
  assert.equal(a.understanding.counts.u80, 1);
  assert.equal(a.understanding.responses, 46);
  // Ортақ сабақ: бөлініс жоқ — комбинацияға көшірілмейді
  const bh = lsAggregate(lessons, 'c_bh');
  assert.equal(bh.lessons, 0);
  assert.equal(bh.attendance.pct, null);
  assert.equal(bh.shared.length, 1);
});

test('ортақ сабақ «Барлығы» көрінісінде екі рет саналмайды, бөлініс берілсе комбинацияға шығады', () => {
  const lessons = [
    { sourceId: 'L1', combos: ['c_bh', 'c_fh'], present: 50, total: 60, liked: 40, avg: 5, disliked: 1, split: { c_bh: { present: 30, total: 35, liked: 25, avg: 2, disliked: 0 }, c_fh: { present: 20, total: 25, liked: 15, avg: 3, disliked: 1 } } },
    { sourceId: 'L2', combos: ['c_bh'], present: 10, total: 10, liked: 9, avg: 1, disliked: 0 },
  ];
  const all = lsAggregate(lessons, null);
  assert.equal(all.attendance.present, 60);
  assert.equal(all.attendance.total, 70);
  assert.equal(all.like.responses, 56);
  const bh = lsAggregate(lessons, 'c_bh');
  assert.equal(bh.attendance.present, 40);
  assert.equal(bh.attendance.total, 45);
  assert.equal(bh.shared.length, 0);
});

test('апталық қатысым мен ұнату сандар бойынша, пайыздар жай орташаланбайды', () => {
  const lessons = [
    { combos: ['c_bh'], present: 80, total: 100, liked: 90, avg: 10, disliked: 0 },
    { combos: ['c_bh'], present: 10, total: 20, liked: 1, avg: 0, disliked: 1 },
  ];
  const a = lsAggregate(lessons, null);
  assert.equal(a.attendance.pct, 75); // 90/120, ал (80+50)/2 = 65 емес
  assert.equal(a.attendance.mode, 'weighted');
  near(a.like.pct, (91 / 102) * 100);
});

test('тек пайыз бар сабақтар бөлек белгіленеді, 100%-дан асқан қатысым қиылмайды', () => {
  const avgOnly = lsAggregate([{ attendancePct: 90 }, { attendancePct: 70 }], null);
  assert.equal(avgOnly.attendance.mode, 'average');
  assert.equal(avgOnly.attendance.pct, 80);
  const over = lsAggregate([{ present: 101, total: 100 }], null);
  assert.equal(over.attendance.pct, 101);
  assert.equal(over.attendance.overflow, true);
});

test('0 мен дерек жоқ ажыратылады', () => {
  const zero = lsAggregate([{ present: 0, total: 30, liked: 0, avg: 0, disliked: 5 }], null);
  assert.equal(zero.attendance.pct, 0);
  assert.equal(zero.like.pct, 0);
  const none = lsAggregate([{ present: null, total: null }], null);
  assert.equal(none.attendance.pct, null);
  assert.equal(none.like.pct, null);
  assert.equal(toNum(''), null);
  assert.equal(toNum('0'), 0);
  assert.equal(toNum('16,2'), 16.2);
});

test('СТ жалпы балл салмақталған: Σ(балл × тапсырған) / Σ тапсырған', () => {
  const data = { combos: [{ comboId: 'c_bh', score: 15, submitted: 30, max: 20 }, { comboId: 'c_fh', score: 18, submitted: 10, max: 20 }] };
  const o = stOverall(data);
  assert.equal(o.source, 'weighted');
  near(o.score, (15 * 30 + 18 * 10) / 40); // 15,75 — жай орташа 16,5 емес
  // салмақ жоқ болса жалпы шығарылмайды
  const noW = stOverall({ combos: [{ comboId: 'c_bh', score: 15 }, { comboId: 'c_fh', score: 18 }] });
  assert.equal(noW.score, null);
  assert.equal(noW.reason, 'no_weights');
  // платформаның жалпы мәні басым
  assert.equal(stOverall({ imported: { score: 16.2, max: 20 }, combos: data.combos }).score, 16.2);
});

test('қайта тапсыру: 25 оқушы, 42% — бөлгіш ойдан табылмайды', () => {
  const r = retakeOf({ retakeCount: 25, retakePct: 42 });
  assert.equal(r.pct, 42);
  assert.equal(r.base, null);
  assert.equal(r.source, 'reported');
  const w = stRetakeOverall({ combos: [{ retakeCount: 25, retakePct: 42 }, { retakeCount: 5, retakeBase: 20 }] });
  assert.equal(w.pct, null); // бір комбинацияның бөлгіші жоқ — жалпы есептелмейді
  const ok = stRetakeOverall({ combos: [{ retakeCount: 10, retakeBase: 40 }, { retakeCount: 5, retakeBase: 10 }] });
  assert.equal(ok.pct, 30);
});

test('динамика: балл, пайыздық тармақ, қайта тапсыру төмендесе — жақсару', () => {
  const st = scoreDelta(16.2, 20, 18.4, 20);
  assert.equal(st.state, 'down');
  assert.equal(st.good, false);
  assert.equal(fmtDelta(st), '−2,2 балл');
  const like = delta(98, 96, 'pp', 'up');
  assert.equal(fmtDelta(like), '+2 п.т.');
  assert.equal(like.good, true);
  const retake = delta(30, 42, 'pp', 'down');
  assert.equal(fmtDelta(retake), '−12 п.т.');
  assert.equal(retake.good, true);
  assert.equal(delta(50, 50, 'pp').state, 'same');
  assert.equal(delta(50, null, 'pp').reason, 'no_previous');
  assert.equal(delta(0, 10, 'pp').state, 'down'); // 0 — жарамды мән
});

test('максимал балл өзгерсе абсолют балл салыстырылмайды', () => {
  const d = scoreDelta(30, 40, 16, 20);
  assert.equal(d.normalized, true);
  assert.equal(d.unit, 'pp');
  assert.equal(d.diff, -5); // 75% − 80%
});

test('ай шекарасындағы алдыңғы апта; аралықтағы апта бос болса ертерек апта алынбайды', () => {
  const P = [
    { id: 'p41', stream_id: 'sp1', kind: 'week', seq: 401 },
    { id: 'p45', stream_id: 'sp1', kind: 'week', seq: 405 }, // 4-айда 5 апта болды
    { id: 'p51', stream_id: 'sp1', kind: 'week', seq: 501 },
    { id: 'x51', stream_id: 'sp2', kind: 'week', seq: 501 },
    { id: 'b1', stream_id: 'sp1', kind: 'bt', seq: 450 },
  ];
  assert.equal(previousWeek(P, P[2]).id, 'p45');
  assert.equal(previousWeek(P, P[0]), null);
  assert.equal(previousWeek(P, P[3]), null); // басқа ағымның аптасы алынбайды
});

test('ТОП-3: тең баллдар бір орында', () => {
  const r = rankTop([{ name: 'A', score: 120 }, { name: 'B', score: 125 }, { name: 'C', score: 120 }]);
  assert.deepEqual(r.map((x) => [x.name, x.rank, x.tie]), [['B', 1, false], ['A', 2, true], ['C', 2, true]]);
  const manual = rankTop([{ name: 'X' }, { name: 'Y', score: 3 }]);
  assert.deepEqual(manual.map((x) => x.name), ['X', 'Y']);
});
