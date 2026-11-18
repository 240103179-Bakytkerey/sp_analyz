import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixStData } from '../lib/migrations/005_st_wrong_pct.mjs';

test('ескі СТ: «қателесті» үлесі сақталған сандардан 2 ондық таңбаға дейін қайта есептеледі', () => {
  const data = {
    imported: { variants: [{ variant: 1, questions: [{ q: 15, pct: 64, answered: 11, wrong: 7 }, { q: 3, pct: 40, answered: 45, wrong: 18 }] }] },
    hardTasks: [{ variant: 1, q: 15, wrongPct: 64, fromPlatform: true, explanation: 'ментор' }, { variant: 1, q: 3, wrongPct: 33, fromPlatform: false }],
  };
  const r = fixStData(data);
  assert.equal(r.changed, true);
  assert.equal(r.data.imported.variants[0].questions[0].pct, 63.64);
  assert.equal(r.data.hardTasks[0].wrongPct, 63.64);
  assert.equal(r.data.hardTasks[0].explanation, 'ментор');
  assert.equal(r.data.hardTasks[1].wrongPct, 33); // ментор қолмен енгізгені өзгермейді
  assert.equal(fixStData({ combos: [] }).changed, false);
});
