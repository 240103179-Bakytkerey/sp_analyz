// Бөлімнің тәсілі: ортақ балл = әр топтың орташа балдарының орташасы (топ саны бойынша, оқушы санымен салмақталмайды).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineResults } from '../lib/platform-combine.js';
import { mergePlatformResult } from '../lib/merge-st.js';

const r = (groups) => ({ kind: 'st', month: 4, week: 1, max: 20, score: 0, submitted: groups.reduce((a, g) => a + g.submitted, 0), total: 0, groups, questionStats: [], tasks: [], topics: [] });

test('бір курс: топтардың орташасы 16 / 18 / 13 → 15,67 (оқушылар бойынша емес)', () => {
  const res = r([{ curator: 'А', score: 16, submitted: 30 }, { curator: 'Б', score: 18, submitted: 5 }, { curator: 'В', score: 13, submitted: 10 }]);
  const g = combineResults([{ course: { courseId: 'a' }, result: res }]);
  assert.equal(g.result.score, 15.67);
  assert.equal(g.result.groupCount, 3);
  assert.equal(g.result.scoreMethod, 'groups');
  const s = combineResults([{ course: { courseId: 'a' }, result: res }], { method: 'students' });
  assert.equal(s.result.score, Math.round(((16 * 30 + 18 * 5 + 13 * 10) / 45) * 100) / 100);
});

test('бірнеше курс: барлық курстың топтары бірге орташаланады; курс комбинациясы да солай', () => {
  const g = combineResults([
    { course: { courseId: 'a', comboId: 'c_bh' }, result: r([{ curator: 'А', score: 10, submitted: 40 }, { curator: 'Б', score: 20, submitted: 2 }]) },
    { course: { courseId: 'b', comboId: 'c_fh' }, result: r([{ curator: 'В', score: 18, submitted: 3 }]) },
  ]);
  assert.equal(g.result.score, 16); // (10 + 20 + 18) / 3
  assert.equal(g.result.courseCombos.find((c) => c.comboId === 'c_bh').score, 15);
});

test('топ → комбинация баптауында да топтардың орташасы', () => {
  const res = { ...r([{ curator: 'А', score: 10, submitted: 40 }, { curator: 'Б', score: 20, submitted: 2 }]), score: 15, scoreMethod: 'groups' };
  const m = mergePlatformResult(null, res, { courseIds: ['a'], importedAt: 'now', groupMap: { 'А': 'c_bh', 'Б': 'c_bh' } });
  assert.equal(m.data.combos[0].score, 15);
});
