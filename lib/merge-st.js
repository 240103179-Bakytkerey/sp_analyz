// JUZ40 платформасының СТ нәтижесін есепке қосу. analysis/src/lib/platform-sync.ts → apply() ойымен:
// платформаның сандары жаңарады, ал ментор жазған мәтін, қайта тапсыру дерегі, түсіндірмелер сақталады.
// Платформа сандары data.imported ішінде, ментордың енгізгені — бөлек өрістерде.
import { isNum } from './calc.js';

const round2 = (n) => Math.round(n * 100) / 100;

// Платформа суреті: http(s) сілтеме сол күйі; ішіне салынған сурет «img:<хэш>» → /api/photo?img=<хэш> (task_images кестесі).
export const imgUrl = (u) => (!u ? null : /^img:[a-f0-9]{8,64}$/.test(u) ? `/api/photo?img=${u.slice(4)}` : /^https?:\/\//.test(u) ? u : null);

/** Есептің платформадан келген бөлігі: мәтін, суреттер, жауап нұсқалары (неше оқушы таңдады), сәйкестендіру. */
function platformPart(q, stat) {
  const picks = stat && Array.isArray(stat.picks) ? stat.picks : null;
  return {
    text: q.text || '', html: q.html || '',
    images: (q.images || []).map(imgUrl).filter(Boolean),
    options: (q.options || []).map((o, i) => ({ text: o.text || '', html: o.html || '', image: imgUrl(o.image), correct: !!o.correct, picks: picks && picks.length === (q.options || []).length ? picks[i] : null })),
    several: !!q.several,
    pairs: (q.pairs || []).map((p) => ({ left: p.left, right: p.right })),
    answered: stat ? stat.answered || null : null,
    level: q.level || '',
  };
}

export function mergePlatformResult(existing, r, ctx) {
  const warnings = [];
  const data = existing ? JSON.parse(JSON.stringify(existing)) : { combos: [], hardTasks: [], mentor: {}, overall: {}, retake: {} };
  data.combos = data.combos || [];
  data.hardTasks = data.hardTasks || [];
  const textOf = new Map();
  // Сұрақтың кілті: бірнеше курс біріктірілгенде — мәтінінің хэші (platform-combine.js), әйтпесе «нұсқа:нөмір».
  const keyOf = (variant, it) => it.key || `${variant}:${it.q}`;
  (r.tasks || []).forEach((v) => v.questions.forEach((q) => textOf.set(keyOf(v.variant, q), q)));
  data.imported = {
    source: 'platform',
    sourceId: `${(ctx.courseIds || [ctx.courseId]).join('+')}:${r.kind}:${r.month}.${r.week}`,
    courses: ctx.perCourse || null,
    importedAt: ctx.importedAt,
    by: ctx.actor || null,
    lessonName: r.lessonName,
    score: r.score,
    scoreMethod: r.scoreMethod || null,
    groupCount: r.groupCount || null,
    max: r.max,
    submitted: r.submitted,
    total: r.total,
    groups: (r.groups || []).map((g) => ({ name: g.curator, course: g.course || null, score: g.score, submitted: g.submitted, total: g.total })),
    variants: (r.questionStats || []).map((v) => ({ variant: v.variant, students: v.students, questions: v.items.map((it) => ({ q: it.q, key: keyOf(v.variant, it), pct: it.pct, answered: it.answered, wrong: it.wrong })) })),
    topics: r.topics || [],
  };

  // Топтар → комбинациялар: барлық топ бапталған болса ғана комбинация сандары толтырылады.
  const map = ctx.groupMap || {};
  const groups = data.imported.groups.filter((g) => g.submitted > 0);
  const unmapped = groups.filter((g) => !map[g.name]);
  if (r.courseCombos && r.courseCombos.length) {
    // Курс → комбинация баптауы басым.
    for (const cc of r.courseCombos) {
      let c = data.combos.find((x) => x.comboId === cc.comboId);
      if (!c) { c = { comboId: cc.comboId, retakeCount: null, retakeBase: null, retakePct: null, note: '' }; data.combos.push(c); }
      c.score = cc.score; c.submitted = cc.submitted; c.max = cc.max; c.fromPlatform = true;
      if (cc.score == null) warnings.push('Бір комбинацияның курстарында максимал балл әртүрлі — оның балы есептелмеді.');
    }
  } else if (groups.length && Object.keys(map).length) {
    if (unmapped.length) warnings.push(`${unmapped.length} топ комбинацияға бапталмаған (${unmapped.map((g) => g.name).slice(0, 5).join(', ')}) — комбинация сандары жаңартылмады.`);
    else {
      const acc = {};
      // Комбинация балы да сол тәсілмен: әдепкіде топтардың орташа балдарының орташасы.
      groups.forEach((g) => { const c = map[g.name]; acc[c] = acc[c] || { s: 0, sw: 0, k: 0, n: 0 }; acc[c].s += g.score; acc[c].k += 1; acc[c].sw += g.score * g.submitted; acc[c].n += g.submitted; });
      for (const [comboId, a] of Object.entries(acc)) {
        let c = data.combos.find((x) => x.comboId === comboId);
        if (!c) { c = { comboId, retakeCount: null, retakeBase: null, retakePct: null, note: '' }; data.combos.push(c); }
        c.score = round2(r.scoreMethod === 'students' ? a.sw / a.n : a.s / a.k);
        c.submitted = a.n;
        c.max = r.max;
        c.fromPlatform = true;
      }
    }
  } else if (groups.length) warnings.push('Топ → комбинация сәйкестігі бапталмаған: комбинациялар бойынша балл ментор енгізеді немесе баптауда сәйкестендіріңіз.');

  // Қиын тапсырмалар: платформадан келгені жаңарады (мәтін, қате үлесі), ментордың түсіндірмесі мен тақырыбы сақталады.
  const top = (r.questionStats || []).flatMap((v) => v.items.filter((it) => (it.answered || 0) >= 5).map((it) => ({ variant: v.variant, ...it, key: keyOf(v.variant, it) })))
    .sort((a, b) => b.pct - a.pct);
  const limit = ctx.limit || 10;
  data.hardTasks.forEach((t) => {
    if (!t.fromPlatform) return;
    const st = top.find((x) => (t.key ? x.key === t.key : x.variant === t.variant && x.q === t.q));
    const q = textOf.get(t.key || `${t.variant}:${t.q}`);
    if (st) t.wrongPct = st.pct;
    if (q) {
      const part = platformPart(q, st);
      if (t.textEdited) { delete part.text; delete part.html; }
      Object.assign(t, part);
    }
  });
  if (!data.hardTasks.length) {
    data.hardTasks = top.slice(0, limit).map((x, i) => {
      const q = textOf.get(x.key) || {};
      return { id: `pt_${String(x.key).replace(/[^a-z0-9_]/gi, '_')}`.slice(0, 60), key: x.key, variant: x.variant, q: x.q, title: '', ...platformPart(q, x), wrongPct: x.pct, topic: '', explanation: '', fromPlatform: true };
    });
  }
  if (!data.topics || !data.topics.length) data.topics = r.topics || [];
  if (isNum(r.max) && data.overall && isNum(data.overall.max) && data.overall.max !== r.max) warnings.push(`Платформадағы максимал балл (${r.max}) қолмен енгізілгеннен (${data.overall.max}) өзгеше.`);
  return { data, summary: { score: r.score, scoreMethod: r.scoreMethod || null, max: r.max, submitted: r.submitted, total: r.total, groups: groups.length, hardTasks: data.hardTasks.length, warnings } };
}
