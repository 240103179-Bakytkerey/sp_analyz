// Есеп деректерін тексеру және тазалау. Сервер клиенттен келген мәнге сенбейді:
// сандар санға айналады (бос → null, 0 сақталады), мәтіндер ұзындығы шектеледі,
// комбинациялар анықтамалықта бар-жоғы тексеріледі. Қате болса — 400 және нақты тізім;
// күмәнді мән болса (мысалы қатысқан > жалпы) — ескерту, бірақ сақтауға кедергі емес.
import { httpError } from './http.js';
import { UNDERSTANDING, toNum, isNum } from './calc.js';
import { richQuestion } from './mathml.js';

const str = (v, max = 4000) => String(v == null ? '' : v).replace(/\r\n/g, '\n').slice(0, max);
const line = (v, max = 300) => str(v, max).replace(/\s+/g, ' ').trim();

function numField(errors, label, v, { int = false, min = 0, max = 1e7 } = {}) {
  if (v == null || v === '') return null;
  const n = toNum(v);
  if (n == null) { errors.push(`${label}: сан емес («${String(v).slice(0, 20)}»)`); return null; }
  if (n < min || n > max) { errors.push(`${label}: ${min}…${max} аралығында болуы керек`); return null; }
  if (int && !Number.isInteger(n)) { errors.push(`${label}: бүтін сан болуы керек`); return null; }
  return n;
}

function survey(errors, warnings, label, src) {
  src = src || {};
  const out = {
    present: numField(errors, label + ' қатысқан', src.present, { int: true }),
    total: numField(errors, label + ' жалпы', src.total, { int: true }),
    attendancePct: numField(errors, label + ' қатысым %', src.attendancePct, { max: 100000 }),
    liked: numField(errors, label + ' Ұнады', src.liked, { int: true }),
    avg: numField(errors, label + ' Орташа', src.avg, { int: true }),
    disliked: numField(errors, label + ' Ұнамады', src.disliked, { int: true }),
    understanding: {},
  };
  UNDERSTANDING.forEach((c) => { out.understanding[c.key] = numField(errors, `${label} түсіну ${c.label}`, (src.understanding || {})[c.key], { int: true }); });
  if (isNum(out.present) && isNum(out.total) && out.present > out.total) warnings.push(`${label}: қатысқан (${out.present}) жалпыдан (${out.total}) көп — басқа ағымнан қосылғандар болуы мүмкін, қатысым 100%-дан асады`);
  const parts = [out.liked, out.avg, out.disliked];
  if (parts.some(isNum) && !parts.every(isNum)) warnings.push(`${label}: сауалнаманың үш саны (Ұнады/Орташа/Ұнамады) толық емес — ұнату есептелмейді`);
  const resp = parts.every(isNum) ? parts.reduce((a, b) => a + b, 0) : null;
  if (isNum(resp) && isNum(out.present) && resp > out.present) warnings.push(`${label}: сауалнама жауаптары (${resp}) қатысқаннан (${out.present}) көп`);
  return out;
}

function comboList(errors, label, v, comboIds) {
  const list = Array.isArray(v) ? [...new Set(v.map(String))] : [];
  list.forEach((c) => { if (!comboIds.has(c)) errors.push(`${label}: «${c}» комбинациясы анықтамалықта жоқ`); });
  return list.filter((c) => comboIds.has(c));
}

function rich(v, max = 20000) {
  return str(v, max);
}

function images(v) {
  return (Array.isArray(v) ? v : []).map((u) => line(u, 1000)).filter((u) => /^(https?:\/\/|\/api\/|img:)/.test(u)).slice(0, 12);
}

export function normalizeLS(data, comboIds) {
  const errors = [], warnings = [];
  data = data || {};
  const lessons = (Array.isArray(data.lessons) ? data.lessons : []).slice(0, 300).map((l, i) => {
    const label = `${i + 1}-сабақ`;
    const s = survey(errors, warnings, label, l);
    const split = {};
    if (l && l.split && typeof l.split === 'object') {
      for (const [c, v] of Object.entries(l.split)) {
        if (!comboIds.has(c)) { errors.push(`${label}: бөліністегі «${c}» комбинациясы жоқ`); continue; }
        split[c] = survey(errors, warnings, `${label} (${c})`, v);
      }
    }
    return {
      id: line(l && l.id, 80) || `l${i + 1}`,
      source: ['sapaline', 'manual', 'json'].includes(l && l.source) ? l.source : 'manual',
      sourceId: line(l && l.sourceId, 120) || null,
      date: line(l && l.date, 20),
      time: line(l && l.time, 10),
      topic: line(l && l.topic, 300),
      agym: line(l && l.agym, 120),
      combos: comboList(errors, label, l && l.combos, comboIds),
      excluded: !!(l && l.excluded),
      ...s,
      split,
      importedAt: l && l.importedAt ? line(l.importedAt, 40) : null,
    };
  });
  const seen = new Map();
  lessons.forEach((l) => {
    if (!l.sourceId) return;
    if (seen.has(l.sourceId)) errors.push(`Бір сабақ (${l.sourceId}) екі рет енгізілген`);
    seen.set(l.sourceId, true);
  });
  const difficulties = (Array.isArray(data.difficulties) ? data.difficulties : []).slice(0, 200).map((d) => ({
    text: str(d && d.text, 3000).trim(),
    student: line(d && d.student, 120),
    count: numField(errors, 'Қиындық саны', d && d.count, { int: true }),
  })).filter((d) => d.text);
  return {
    data: {
      lessons,
      difficulties,
      mentor: { summary: str(data.mentor && data.mentor.summary, 6000).trim(), nextSteps: str(data.mentor && data.mentor.nextSteps, 6000).trim() },
      importInfo: data.importInfo && typeof data.importInfo === 'object' ? data.importInfo : null,
    },
    errors,
    warnings,
  };
}

function task(errors, t, i) {
  return {
    id: line(t && t.id, 60) || `t${i + 1}`,
    key: line(t && t.key, 80) || null,
    variant: numField(errors, `${i + 1}-есеп нұсқасы`, t && t.variant, { int: true, max: 1000 }),
    q: numField(errors, `${i + 1}-есеп нөмірі`, t && t.q, { int: true, max: 1000 }),
    title: line(t && t.title, 200),
    text: rich(t && t.text),
    // HTML тек рұқсат етілген тегтермен (MathML, sub/sup, br, p) сақталады — клиенттен келгеніне сенілмейді.
    html: t && t.html ? richQuestion(str(t.html, 40000)).safeHtml || '' : '',
    images: images(t && t.images),
    wrongPct: numField(errors, `${i + 1}-есеп қате үлесі`, t && t.wrongPct, { max: 100 }),
    topic: line(t && t.topic, 200),
    explanation: rich(t && t.explanation, 6000),
    fromPlatform: !!(t && t.fromPlatform),
  };
}

export function normalizeST(data, comboIds, prevImported) {
  const errors = [], warnings = [];
  data = data || {};
  const combos = (Array.isArray(data.combos) ? data.combos : []).slice(0, 50).map((c, i) => {
    const label = `${i + 1}-комбинация`;
    const id = String(c && c.comboId || '');
    if (!comboIds.has(id)) errors.push(`${label}: комбинация таңдалмаған немесе анықтамалықта жоқ`);
    const out = {
      comboId: id,
      score: numField(errors, label + ' ортақ балл', c && c.score, { max: 1000 }),
      max: numField(errors, label + ' максимал балл', c && c.max, { max: 1000 }),
      submitted: numField(errors, label + ' тапсырғандар', c && c.submitted, { int: true }),
      retakeCount: numField(errors, label + ' қайта тапсыратындар', c && c.retakeCount, { int: true }),
      retakeBase: numField(errors, label + ' оқушы саны (бөлгіш)', c && c.retakeBase, { int: true }),
      retakePct: numField(errors, label + ' қайта тапсыру %', c && c.retakePct, { max: 100 }),
      note: str(c && c.note, 3000).trim(),
    };
    if (isNum(out.score) && isNum(out.max) && out.score > out.max) errors.push(`${label}: балл максималдан үлкен`);
    if (isNum(out.retakeCount) && isNum(out.retakeBase) && out.retakeCount > out.retakeBase) errors.push(`${label}: қайта тапсыратындар оқушы санынан көп`);
    if (isNum(out.retakeCount) && isNum(out.retakeBase) && isNum(out.retakePct)) warnings.push(`${label}: сан мен бөлгіш берілгенде пайыз солардан есептеледі, енгізілген % ескерілмейді`);
    return out;
  });
  const dup = combos.map((c) => c.comboId).filter((c, i, a) => c && a.indexOf(c) !== i);
  if (dup.length) errors.push('Бір комбинация екі рет енгізілген: ' + [...new Set(dup)].join(', '));
  const o = data.overall || {};
  const overall = {
    score: numField(errors, 'Жалпы ортақ балл', o.score, { max: 1000 }),
    max: numField(errors, 'Максимал балл', o.max, { max: 1000 }),
    submitted: numField(errors, 'Жалпы тапсырғандар', o.submitted, { int: true }),
    total: numField(errors, 'Жалпы оқушылар', o.total, { int: true }),
  };
  if (isNum(overall.score) && isNum(overall.max) && overall.score > overall.max) errors.push('Жалпы балл максималдан үлкен');
  const r = data.retake || {};
  const retake = {
    retakeCount: numField(errors, 'Жалпы қайта тапсыратындар', r.retakeCount, { int: true }),
    retakeBase: numField(errors, 'Жалпы оқушы саны (бөлгіш)', r.retakeBase, { int: true }),
    retakePct: numField(errors, 'Жалпы қайта тапсыру %', r.retakePct, { max: 100 }),
  };
  const hardTasks = (Array.isArray(data.hardTasks) ? data.hardTasks : []).slice(0, 100).map((t, i) => task(errors, t, i));
  return {
    data: {
      // Платформадан келген сандар тек серверлік импорт арқылы өзгереді.
      imported: prevImported || null,
      overallSource: ['platform', 'manual', 'weighted'].includes(data.overallSource) ? data.overallSource : 'auto',
      overall,
      combos,
      retake,
      hardTasks,
      topics: (Array.isArray(data.topics) ? data.topics : []).map((t) => line(t, 200)).filter(Boolean).slice(0, 50),
      mentor: {
        summary: str(data.mentor && data.mentor.summary, 6000).trim(),
        combosAnalysis: str(data.mentor && data.mentor.combosAnalysis, 6000).trim(),
        recommendation: str(data.mentor && data.mentor.recommendation, 6000).trim(),
      },
    },
    errors,
    warnings,
  };
}

function top(errors, list, label) {
  return (Array.isArray(list) ? list : []).slice(0, 10).map((x, i) => ({
    name: line(x && x.name, 120),
    score: numField(errors, `${label} ${i + 1}-орын балы`, x && x.score, { max: 10000 }),
    note: line(x && x.note, 200),
  })).filter((x) => x.name);
}

export function normalizeBT(data, subjectIds) {
  const errors = [], warnings = [];
  data = data || {};
  const subjects = (Array.isArray(data.subjects) ? data.subjects : []).slice(0, 40).map((s, i) => {
    const sid = s && s.subjectId ? String(s.subjectId) : null;
    const label = line(s && s.label, 60);
    const name = sid ? sid : label || `${i + 1}-пән`;
    if (sid && !subjectIds.has(sid)) errors.push(`«${sid}» пәні анықтамалықта жоқ`);
    if (!sid && !label) errors.push(`${i + 1}-жол: пән таңдалмаған немесе қосымша көрсеткіш атауы жазылмаған`);
    const out = {
      subjectId: sid && subjectIds.has(sid) ? sid : null,
      label,
      avg: numField(errors, `${name} ортақ балл`, s && s.avg, { max: 10000 }),
      max: numField(errors, `${name} максимал балл`, s && s.max, { max: 10000 }),
      participants: numField(errors, `${name} тапсырғандар`, s && s.participants, { int: true }),
      top3: top(errors, s && s.top3, name),
      hardTopics: (Array.isArray(s && s.hardTopics) ? s.hardTopics : []).map((t) => str(t, 500).trim()).filter(Boolean).slice(0, 50),
      recommendation: str(s && s.recommendation, 6000).trim(),
    };
    if (isNum(out.avg) && isNum(out.max) && out.avg > out.max) errors.push(`${name}: ортақ балл максималдан үлкен`);
    if (isNum(out.avg) && !isNum(out.max)) warnings.push(`${name}: максимал балл берілмеген — динамиканы нормалау мүмкін болмайды`);
    return out;
  });
  const dup = subjects.map((s) => s.subjectId).filter((s, i, a) => s && a.indexOf(s) !== i);
  if (dup.length) errors.push('Бір пән екі рет енгізілген: ' + [...new Set(dup)].join(', '));
  const o = data.overall || {};
  const overall = { avg: numField(errors, 'Жалпы ортақ балл', o.avg, { max: 10000 }), max: numField(errors, 'Жалпы максимал балл', o.max, { max: 10000 }) };
  if (isNum(overall.avg) && isNum(overall.max) && overall.avg > overall.max) errors.push('Жалпы ортақ балл максималдан үлкен');
  return {
    data: {
      participants: numField(errors, 'Тест тапсырғандар', data.participants, { int: true }),
      comparable: data.comparable !== false,
      overall,
      top3: top(errors, data.top3, 'Жалпы ТОП'),
      subjects,
      hardTopics: (Array.isArray(data.hardTopics) ? data.hardTopics : []).map((t) => str(t, 500).trim()).filter(Boolean).slice(0, 50),
      analysis: str(data.analysis, 8000).trim(),
      actionPlan: str(data.actionPlan, 8000).trim(),
    },
    errors,
    warnings,
  };
}

export function normalizeReport(type, data, ctx) {
  const r = type === 'ls' ? normalizeLS(data, ctx.comboIds) : type === 'st' ? normalizeST(data, ctx.comboIds, ctx.prevImported) : type === 'bt' ? normalizeBT(data, ctx.subjectIds) : null;
  if (!r) throw httpError(400, 'Есеп түрі белгісіз.');
  if (r.errors.length) {
    const e = httpError(400, 'Есепте қате бар:\n• ' + r.errors.slice(0, 12).join('\n• '), 'invalid');
    e.details = r.errors;
    throw e;
  }
  return r;
}
