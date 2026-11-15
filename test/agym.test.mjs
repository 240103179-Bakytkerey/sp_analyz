// SapaLine «stream» кодынан ағым мен комбинацияны анықтау: «ГЕОМАТ-1, ФИЗМАТ-1» → SP-1, ортақ сабақ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAgym, mergeLessons } from '../lib/merge-ls.js';

const teacher = { full_name: 'Құлахмет Нұрдәулет', display: 'Құлахмет Нұрдәулет', aliases: [] };
const comboByCode = new Map([['инфомат', 'c_im'], ['геомат', 'c_gm'], ['физмат', 'c_fm']]);
const ctx = (streamId, config = {}) => ({ streamId, teacher, config, comboIds: new Set(['c_im', 'c_gm', 'c_fm']), comboByCode, divisionIsStream: false, importedAt: 'now', source: 'sapaline' });
const rows = [
  { num: '1', teacher: 'Құлахмет Нұрдәулет', agym: 'ИНФОМАТ-1', present: 20, total: 22, survey: { liked: 15, avg: 1, disliked: 0 } },
  { num: '2', teacher: 'Құлахмет Нұрдәулет', agym: 'ГЕОМАТ-1, ФИЗМАТ-1', present: 30, total: 31 },
  { num: '3', teacher: 'Нұрдаулет Олжас', agym: 'ИНФОМАТ-2, ФИЗМАТ-2', present: 9, total: 9 },
  { num: '4', teacher: 'Құлахмет Нұрдәулет', agym: 'ГЕОМ-1', present: 5, total: 5 },
];

test('ағым коды: соңғы сан — ағым, алдыңғы бөлігі — комбинация', () => {
  assert.deepEqual(parseAgym('ГЕОМАТ-1, ФИЗМАТ-1'), [{ code: 'ГЕОМАТ', n: 1 }, { code: 'ФИЗМАТ', n: 1 }]);
  assert.deepEqual(parseAgym('ГЕОМ-2'), [{ code: 'ГЕОМ', n: 2 }]);
});

test('SP-1 импорты: басқа ағымның сабағы алынбайды, ортақ сабақ екі комбинациямен, белгісіз код ескертіледі', () => {
  const r = mergeLessons(null, rows, ctx('sp1'));
  assert.equal(r.summary.lessons, 3);
  assert.equal(r.summary.skipped.length, 0);
  assert.equal(r.summary.otherStream, 1);
  const l2 = r.data.lessons.find((l) => l.sourceId === '2');
  assert.deepEqual(l2.combos, ['c_gm', 'c_fm']);
  assert.deepEqual(r.summary.unknownCombos, ['ГЕОМ']);
  const ign = mergeLessons(null, rows, ctx('sp1', { ignoreCodes: ['ГЕОМ'] }));
  assert.deepEqual(ign.summary.unknownCombos, []);
});
