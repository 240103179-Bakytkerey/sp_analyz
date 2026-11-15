// Бір ағым × пәнге платформада бірнеше курс сәйкес келуі мүмкін (мысалы, комбинациялар бойынша бөлек курстар).
// Бұл модуль әр курстың СТ нәтижесін біріктіріп, бір PlatformResult пішімінде қайтарады:
//  - жалпы балл тапсырғандар санымен салмақталады: Σ(балл × тапсырған) ÷ Σ тапсырған;
//  - максимал балл курстарда әртүрлі болса — жалпы балл есептелмейді (ескерту);
//  - мәтіні бірдей сұрақтардың қате саны мен жауап саны қосылады (үлес қайта есептеледі),
//    әртүрлі тесттердің сұрақтары бөлек қалады;
//  - курсқа комбинация берілсе, комбинация балы сол курстардан салмақталып шығады.
import { createHash } from 'node:crypto';

const round2 = (n) => Math.round(n * 100) / 100;

/** Баптаудағы курстар: бұрынғы пішім { courseId, courseName } немесе жаңа — тізім. */
export function coursesOf(cfg, key) {
  const v = ((cfg && cfg.courses) || {})[key];
  if (!v) return [];
  const list = Array.isArray(v) ? v : [v];
  return list.filter((c) => c && c.courseId).map((c) => ({ courseId: String(c.courseId), courseName: c.courseName || '', comboId: c.comboId || null }));
}

const textKey = (t) => 'tx_' + createHash('sha1').update(String(t || '').replace(/\s+/g, ' ').trim().toLowerCase()).digest('hex').slice(0, 16);

/** list: [{ course: { courseId, courseName, comboId }, result: PlatformResult }] (result null болмауы керек) */
export function combineResults(list) {
  const warnings = [];
  const ok = list.filter((x) => x.result);
  const maxes = [...new Set(ok.map((x) => x.result.max))];
  const submitted = ok.reduce((a, x) => a + (x.result.submitted || 0), 0);
  const total = ok.reduce((a, x) => a + (x.result.total || 0), 0);
  let score = null, max = maxes.length === 1 ? maxes[0] : null;
  if (maxes.length > 1) warnings.push(`Курстардың максимал балы әртүрлі (${maxes.join(', ')}) — жалпы ортақ балл есептелмеді.`);
  else if (submitted > 0) score = round2(ok.reduce((a, x) => a + x.result.score * x.result.submitted, 0) / submitted);

  // Сұрақтар: мәтіні бойынша біріктіріледі.
  const byKey = new Map();
  const order = [];
  ok.forEach((x, ci) => {
    const tasks = new Map();
    (x.result.tasks || []).forEach((v) => v.questions.forEach((q) => tasks.set(`${v.variant}:${q.q}`, q)));
    (x.result.questionStats || []).forEach((v) => {
      v.items.forEach((it) => {
        const task = tasks.get(`${v.variant}:${it.q}`);
        const key = task && task.text ? textKey(task.text) : `c${ci}:${v.variant}:${it.q}`;
        let e = byKey.get(key);
        if (!e) { e = { key, variant: v.variant, q: it.q, answered: 0, wrong: 0, task: task ? { ...task, key } : null, courses: [] }; byKey.set(key, e); order.push(e); }
        e.answered += it.answered || 0;
        e.wrong += it.wrong || 0;
        if (!e.courses.includes(x.course.courseName || x.course.courseId)) e.courses.push(x.course.courseName || x.course.courseId);
      });
    });
  });
  const variants = new Map();
  order.forEach((e) => {
    if (!variants.has(e.variant)) variants.set(e.variant, { variant: e.variant, students: 0, items: [], questions: [] });
    const v = variants.get(e.variant);
    v.items.push({ q: e.q, key: e.key, answered: e.answered, wrong: e.wrong, pct: e.answered ? Math.round((100 * e.wrong) / e.answered) : 0 });
    if (e.task) v.questions.push(e.task);
  });
  ok.forEach((x) => (x.result.questionStats || []).forEach((v) => { if (variants.has(v.variant)) variants.get(v.variant).students += v.students || 0; }));

  // Курс → комбинация
  const withCombo = ok.filter((x) => x.course.comboId);
  let courseCombos = null;
  if (withCombo.length) {
    if (withCombo.length < ok.length) warnings.push(`${ok.length - withCombo.length} курсқа комбинация берілмеген — олар тек жалпы нәтижеге кіреді.`);
    const acc = {};
    withCombo.forEach((x) => {
      const c = x.course.comboId;
      acc[c] = acc[c] || { s: 0, n: 0, maxes: new Set() };
      acc[c].s += x.result.score * x.result.submitted; acc[c].n += x.result.submitted; acc[c].maxes.add(x.result.max);
    });
    courseCombos = Object.entries(acc).filter(([, a]) => a.n > 0).map(([comboId, a]) => (a.maxes.size === 1
      ? { comboId, score: round2(a.s / a.n), submitted: a.n, max: [...a.maxes][0] }
      : { comboId, score: null, submitted: a.n, max: null }));
  }

  const first = ok[0] ? ok[0].result : {};
  return {
    result: {
      kind: 'st', month: first.month, week: first.week,
      lessonName: [...new Set(ok.map((x) => x.result.lessonName).filter(Boolean))].join(' · '),
      max, score, submitted, total,
      groups: ok.flatMap((x) => (x.result.groups || []).map((g) => ({ ...g, course: x.course.courseName || x.course.courseId }))),
      questionStats: [...variants.values()].map((v) => ({ variant: v.variant, students: v.students, items: v.items })),
      tasks: [...variants.values()].map((v) => ({ variant: v.variant, questions: v.questions })),
      topics: [...new Set(ok.flatMap((x) => x.result.topics || []))],
      courseCombos,
    },
    perCourse: list.map((x) => ({ courseId: x.course.courseId, courseName: x.course.courseName, comboId: x.course.comboId, found: !!x.result, error: x.error || null,
      score: x.result ? x.result.score : null, max: x.result ? x.result.max : null, submitted: x.result ? x.result.submitted : null, total: x.result ? x.result.total : null })),
    warnings,
  };
}
