// SapaLine «stream» кодынан ағым мен комбинацияны анықтау: «ГЕОМАТ-1, ФИЗМАТ-1» → SP-1, ортақ сабақ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAgym, mergeLessons } from '../lib/merge-ls.js';

const teacher = { full_name: 'Құлахмет Нұрдәулет', display: 'Құлахмет Нұрдәулет', aliases: [] };
const comboByCode = new Map([['ИНФОМАТ', 'c_im'], ['ГЕОМАТ', 'c_gm'], ['ФИЗМАТ', 'c_fm']]);
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

import { normCode, comboCodeMap, detectCombo } from '../lib/merge-ls.js';
import { parseTelegram } from '../lib/telegram.js';
import fs from 'node:fs';

const catalog = JSON.parse(fs.readFileSync(new URL('../seed/catalog.json', import.meta.url), 'utf8'));

test('комбинация кодтары: бос орын/сызықша/әріп өлшемі елеусіз, баламалы код танылады', () => {
  const m = comboCodeMap(catalog.combinations);
  assert.equal(catalog.combinations.length, 13);
  assert.equal(m.get(normCode('ДЖТАНГЛ-IELTS')), 'c_djtangl_ielts');
  assert.equal(m.get(normCode('джтангл toefl')), 'c_djtangl_toefl');
  assert.equal(m.get(normCode('БХ')), 'c_bh');
  assert.equal(m.get(normCode('ӘДЕБТІЛ')), 'c_adebtil');
  assert.equal(detectCombo('SMART PRO-1 | Химия | БИОХИМ (қараша)', catalog.combinations), 'c_bh');
  assert.equal(detectCombo('SP-2 Дүниежүзі тарихы ДЖТАНГЛ IELTS', catalog.combinations), 'c_djtangl_ielts');
  assert.equal(detectCombo('SP-2 Химия', catalog.combinations), null);
});

test('SapaLine: «ДЖТАНГЛ IELTS-2, ДЖТҚҰҚЫҚ-2» → SP-2, екі комбинация', () => {
  const t = { full_name: 'Райхан Ардақ', display: 'Райхан Ардақ', aliases: [] };
  const r = mergeLessons(null, [{ num: '9', teacher: 'Райхан Ардақ', agym: 'ДЖТАНГЛ IELTS-2, ДЖТҚҰҚЫҚ-2', present: 10, total: 12 }],
    { streamId: 'sp2', teacher: t, config: {}, comboIds: new Set(catalog.combinations.map((c) => c.id)), comboByCode: comboCodeMap(catalog.combinations), divisionIsStream: false, importedAt: 'now' });
  assert.deepEqual(r.data.lessons[0].combos, ['c_djtangl_ielts', 'c_djtquq']);
  assert.deepEqual(r.summary.unknownCombos, []);
});

test('Telegram: ұзын код бірінші, «ДЖТАНГЛ TOEFL» мен «ГЕОДЖТ» дұрыс бөлінеді', () => {
  const d = parseTelegram('SP-3, Дүниежүзі тарихы, ДЖТАНГЛ TOEFL және ГЕОДЖТ, 5-ай 1-апта', 'ls', catalog).draft;
  assert.deepEqual(d.combos.sort(), ['c_djtangl_toefl', 'c_geodjt']);
});
