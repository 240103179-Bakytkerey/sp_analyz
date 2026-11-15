// Бір пәнге бірнеше курс: салмақталған жалпы балл, курс → комбинация, сұрақтар мәтіні бойынша біріктіріледі.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineResults, coursesOf } from '../lib/platform-combine.js';
import { mergePlatformResult } from '../lib/merge-st.js';

const res = (score, submitted, max, wrongs) => ({
  kind: 'st', month: 4, week: 1, lessonName: 'СТ', max, score, submitted, total: submitted + 2, groups: [{ curator: 'К', score, submitted, total: submitted }], topics: [],
  questionStats: [{ variant: 1, students: submitted, items: wrongs.map((w, i) => ({ q: i + 1, pct: Math.round((100 * w) / submitted), answered: submitted, wrong: w })) }],
  tasks: [{ variant: 1, questions: wrongs.map((w, i) => ({ q: i + 1, text: i === 0 ? 'Ортақ есеп: H2SO4' : `Курсқа тән есеп ${score}`, images: [] })) }],
});

test('бірнеше курс («оқушылар бойынша» тәсілі): Σ(балл×тапсырған)/Σ тапсырған, курс комбинациясы, ортақ сұрақ біріктіріледі', () => {
  const c = combineResults([
    { course: { courseId: 'a', courseName: 'Химия БХ', comboId: 'c_bh' }, result: res(15, 30, 20, [15, 3]) },
    { course: { courseId: 'b', courseName: 'Химия ФХ', comboId: 'c_fh' }, result: res(18, 10, 20, [5, 1]) },
    { course: { courseId: 'c', courseName: 'Бос курс' }, result: null },
  ], { method: 'students' });
  assert.equal(c.result.score, 15.75);
  assert.equal(c.result.submitted, 40);
  assert.deepEqual(c.result.courseCombos.map((x) => [x.comboId, x.score, x.submitted]), [['c_bh', 15, 30], ['c_fh', 18, 10]]);
  const items = c.result.questionStats[0].items;
  assert.equal(items.length, 3); // ортақ есеп бір рет, екі курсқа тән есеп бөлек
  const shared = items.find((it) => it.answered === 40);
  assert.equal(shared.wrong, 20);
  assert.equal(shared.pct, 50);
  assert.equal(c.perCourse.find((x) => x.courseId === 'c').found, false);
  const m = mergePlatformResult(null, c.result, { courseIds: ['a', 'b'], importedAt: 'now' });
  assert.equal(m.data.imported.score, 15.75);
  assert.equal(m.data.combos.find((x) => x.comboId === 'c_bh').score, 15);
  assert.equal(m.data.hardTasks[0].wrongPct, 50);
  assert.ok(m.data.hardTasks[0].key);
});

test('максимал балл әртүрлі болса жалпы балл есептелмейді; бұрынғы бір курстық баптау да оқылады', () => {
  const c = combineResults([{ course: { courseId: 'a' }, result: res(15, 30, 20, [1]) }, { course: { courseId: 'b' }, result: res(30, 10, 40, [1]) }]);
  assert.equal(c.result.score, null);
  assert.ok(c.warnings.some((w) => /әртүрлі/.test(w)));
  assert.deepEqual(coursesOf({ courses: { 'sp1.chemistry': { courseId: 'x', courseName: 'X' } } }, 'sp1.chemistry').map((x) => x.courseId), ['x']);
});
