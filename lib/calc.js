// Есептеу ережелері: ЛС / СТ / БТ көрсеткіштері, салмақталған біріктіру және динамика.
// Бұл файл серверде де, браузерде де қолданылады (scripts/build.mjs оны бетке енгізеді),
// сондықтан ішінде import жоқ және тек таза функциялар бар.
//
// Негізгі қағидалар:
//  - null / undefined / '' — «дерек жоқ», 0 — жарамды сан. Екеуі ешқашан араласпайды.
//  - Пайыздар алым/бөлім арқылы біріктіріледі; сабақ не комбинация пайыздары жай орташаланбайды.
//  - Дөңгелектеу тек көрсетерде жасалады (fmt*), есептеу толық дәлдікпен жүреді.
//  - Динамика әрдайым жаңадан есептеледі: алдыңғы есеп түзетілсе, айырма да өзгереді.

export const UNDERSTANDING = [
  { key: 'u90', label: '90–100%' },
  { key: 'u80', label: '80–90%' },
  { key: 'u70', label: '70–80%' },
  { key: 'u60', label: '60–70%' },
  { key: 'u50', label: '50–60%' },
  { key: 'u0', label: '0–50%' },
];

export function isNum(v) {
  return typeof v === 'number' && isFinite(v);
}

/** Мәтін/сан → сан; бос, сызықша, мәтін → null. «16,2» де қабылданады. */
export function toNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var s = String(v).trim().replace(/\s| /g, '').replace(',', '.').replace(/%$/, '');
  if (s === '' || /^[—–-]$/.test(s)) return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null;
  var n = Number(s);
  return isFinite(n) ? n : null;
}

export function ratio(num, den) {
  return isNum(num) && isNum(den) && den > 0 ? (100 * num) / den : null;
}

function addTo(acc, key, v) {
  if (isNum(v)) acc[key] = (acc[key] || 0) + v;
}

/* ============================== ЛС ============================== */

/** Бір сабақтың (немесе оның комбинациялық бөлінісінің) сандары. */
function lessonValues(src) {
  src = src || {};
  var u = {};
  var und = src.understanding || {};
  UNDERSTANDING.forEach(function (c) { u[c.key] = toNum(und[c.key]); });
  return {
    present: toNum(src.present),
    total: toNum(src.total),
    attendancePct: toNum(src.attendancePct),
    liked: toNum(src.liked),
    avg: toNum(src.avg),
    disliked: toNum(src.disliked),
    understanding: u,
  };
}

function sumSplits(split) {
  var keys = Object.keys(split || {});
  if (!keys.length) return null;
  var out = { present: null, total: null, liked: null, avg: null, disliked: null, understanding: {} };
  ['present', 'total', 'liked', 'avg', 'disliked'].forEach(function (k) {
    var all = keys.every(function (c) { return isNum(toNum(split[c][k])); });
    out[k] = all ? keys.reduce(function (s, c) { return s + toNum(split[c][k]); }, 0) : null;
  });
  UNDERSTANDING.forEach(function (u) {
    var all = keys.every(function (c) { return isNum(toNum((split[c].understanding || {})[u.key])); });
    out.understanding[u.key] = all ? keys.reduce(function (s, c) { return s + toNum(split[c].understanding[u.key]); }, 0) : null;
  });
  return out;
}

/** Сабақтың «Барлығы» деңгейіндегі мәні: сабақтың өз сандары, ал олар жоқ болса — бөліністердің қосындысы. */
function lessonOverall(lesson) {
  var own = lessonValues(lesson);
  var hasOwn = isNum(own.present) || isNum(own.total) || isNum(own.attendancePct) || isNum(own.liked) || isNum(own.avg) || isNum(own.disliked) ||
    UNDERSTANDING.some(function (c) { return isNum(own.understanding[c.key]); });
  if (hasOwn) return own;
  var s = sumSplits(lesson.split);
  return s ? lessonValues(s) : own;
}

/**
 * ЛС есебінің көрсеткіштері.
 * combo = null — «Барлығы»: әр сабақ бір рет саналады (ортақ сабақ та бір рет).
 * combo = id   — тек сол комбинацияға нақты тиесілі сандар: бір комбинациялы сабақтар және
 *                ментор енгізген бөлініс. Бөлінісі жоқ ортақ сабақ санға қосылмайды, бөлек аталады.
 */
export function lsAggregate(lessons, combo) {
  lessons = (lessons || []).filter(function (l) { return l && !l.excluded; });
  var used = [], shared = [], unattributed = 0;
  lessons.forEach(function (l) {
    var combos = l.combos || [];
    if (!combo) { used.push(lessonOverall(l)); return; }
    if (combos.length === 1 && combos[0] === combo) { used.push(lessonOverall(l)); return; }
    if (l.split && l.split[combo]) { used.push(lessonValues(l.split[combo])); return; }
    if (combos.indexOf(combo) >= 0) shared.push({ id: l.sourceId || l.id || null, date: l.date || '', topic: l.topic || '', combos: combos.slice() });
    else if (!combos.length) unattributed++;
  });

  // Қатысым: алымы мен бөлімі белгілі сабақтар қосылады. Тек пайыз бар сабақтар бөлек ескеріледі.
  var present = 0, total = 0, counted = 0, pctOnly = [], overflowLessons = 0;
  used.forEach(function (v) {
    if (isNum(v.present) && isNum(v.total) && v.total > 0) {
      present += v.present; total += v.total; counted++;
      if (v.present > v.total) overflowLessons++;
    } else if (isNum(v.attendancePct)) pctOnly.push(v.attendancePct);
  });
  var att;
  if (counted && !pctOnly.length) att = { mode: 'weighted', present: present, total: total, pct: ratio(present, total) };
  else if (counted && pctOnly.length) att = { mode: 'partial', present: present, total: total, pct: ratio(present, total), pctOnlyLessons: pctOnly.length };
  else if (pctOnly.length) att = { mode: 'average', present: null, total: null, pct: pctOnly.reduce(function (a, b) { return a + b; }, 0) / pctOnly.length, pctOnlyLessons: pctOnly.length };
  else att = { mode: null, present: null, total: null, pct: null };
  att.lessons = counted + pctOnly.length;
  att.overflow = isNum(att.pct) && att.pct > 100;
  att.overflowLessons = overflowLessons;

  // Ұнату: сауалнамасы толық сабақтардың жауап сандары қосылады.
  var L = 0, A = 0, X = 0, surveyed = 0;
  used.forEach(function (v) {
    if (isNum(v.liked) && isNum(v.avg) && isNum(v.disliked)) { L += v.liked; A += v.avg; X += v.disliked; surveyed++; }
  });
  var resp = L + A + X;
  var like = surveyed
    ? { liked: L, avg: A, disliked: X, responses: resp, pct: ratio(L, resp), lessons: surveyed }
    : { liked: null, avg: null, disliked: null, responses: null, pct: null, lessons: 0 };

  // Түсіну деңгейі: тек сауалнама санаттарының жауап саны. Орташа түсіну пайызы есептелмейді.
  var und = {}, undResp = 0, undLessons = 0;
  UNDERSTANDING.forEach(function (c) { und[c.key] = null; });
  used.forEach(function (v) {
    var any = UNDERSTANDING.some(function (c) { return isNum(v.understanding[c.key]); });
    if (!any) return;
    undLessons++;
    UNDERSTANDING.forEach(function (c) {
      var n = v.understanding[c.key];
      if (isNum(n)) { und[c.key] = (und[c.key] || 0) + n; undResp += n; }
      else if (und[c.key] == null) und[c.key] = 0;
    });
  });

  return {
    lessons: used.length,
    shared: shared,
    unattributed: unattributed,
    attendance: att,
    like: like,
    understanding: { counts: und, responses: undLessons ? undResp : null, lessons: undLessons },
  };
}

/* ============================== СТ ============================== */

/**
 * СТ-ның жалпы ортақ баллы.
 * Реті: платформадан келген жалпы мән → ментор бөлек енгізген жалпы мән →
 * комбинациялар бойынша салмақталған мән (тек барлығының тапсырған саны белгілі болса).
 * Салмақ жоқ болса, жай орташа жалпы нәтиже ретінде көрсетілмейді.
 */
export function stOverall(data) {
  data = data || {};
  var imp = data.imported || {};
  var man = data.overall || {};
  var combos = (data.combos || []).filter(function (c) { return c && isNum(toNum(c.score)); });
  if (data.overallSource !== 'manual' && data.overallSource !== 'weighted' && isNum(toNum(imp.score))) {
    return { score: toNum(imp.score), max: toNum(imp.max), submitted: toNum(imp.submitted), total: toNum(imp.total), source: 'platform' };
  }
  if (data.overallSource !== 'weighted' && isNum(toNum(man.score))) {
    return { score: toNum(man.score), max: toNum(man.max) != null ? toNum(man.max) : toNum(imp.max), submitted: toNum(man.submitted), total: toNum(man.total), source: 'manual' };
  }
  if (combos.length) {
    var weightsKnown = combos.every(function (c) { return isNum(toNum(c.submitted)) && toNum(c.submitted) > 0; });
    var maxes = combos.map(function (c) { return toNum(c.max); }).filter(isNum);
    var sameMax = maxes.length === combos.length && maxes.every(function (m) { return m === maxes[0]; });
    if (weightsKnown && (sameMax || !maxes.length)) {
      var sw = 0, s = 0;
      combos.forEach(function (c) { sw += toNum(c.submitted); s += toNum(c.score) * toNum(c.submitted); });
      return { score: s / sw, max: sameMax ? maxes[0] : toNum(man.max) != null ? toNum(man.max) : toNum(imp.max), submitted: sw, total: null, source: 'weighted', combos: combos.length };
    }
    return { score: null, max: null, submitted: null, total: null, source: null, reason: weightsKnown ? 'max_differs' : 'no_weights' };
  }
  return { score: null, max: toNum(imp.max) != null ? toNum(imp.max) : toNum(man.max), submitted: null, total: null, source: null };
}

/** Бір комбинацияның (немесе жалпы деңгейдің) қайта тапсыру үлесі. Бөлгіш белгісіз болса ойдан табылмайды. */
export function retakeOf(src) {
  src = src || {};
  var count = toNum(src.retakeCount), base = toNum(src.retakeBase), reported = toNum(src.retakePct);
  if (isNum(count) && isNum(base) && base > 0) return { count: count, base: base, pct: ratio(count, base), source: 'counts' };
  if (isNum(reported)) return { count: count, base: null, pct: reported, source: 'reported' };
  return { count: count, base: null, pct: null, source: null };
}

/** СТ жалпы қайта тапсыру: ментордың жалпы мәні, болмаса Σ саны / Σ бөлгіш (барлық комбинацияда бар болса). */
export function stRetakeOverall(data) {
  data = data || {};
  var own = retakeOf(data.retake);
  if (own.source) return own;
  var combos = (data.combos || []).filter(function (c) { return c && (isNum(toNum(c.retakeCount)) || isNum(toNum(c.retakePct))); });
  if (!combos.length) return own;
  var full = combos.every(function (c) { return isNum(toNum(c.retakeCount)) && isNum(toNum(c.retakeBase)) && toNum(c.retakeBase) > 0; });
  if (!full) return { count: null, base: null, pct: null, source: null, reason: 'no_base' };
  var n = 0, d = 0;
  combos.forEach(function (c) { n += toNum(c.retakeCount); d += toNum(c.retakeBase); });
  return { count: n, base: d, pct: ratio(n, d), source: 'weighted' };
}

export function stCombo(data, comboId) {
  var c = (data && data.combos || []).filter(function (x) { return x && x.comboId === comboId; })[0];
  if (!c) return null;
  return { score: toNum(c.score), max: toNum(c.max) != null ? toNum(c.max) : stOverall(data).max, submitted: toNum(c.submitted), retake: retakeOf(c), note: c.note || '' };
}

/* ============================== БТ ============================== */

/** Тең баллдарды ескеретін орын: 1, 1, 3 … Балл жоқ болса ментордың реті сақталады. */
export function rankTop(list) {
  list = (list || []).filter(function (x) { return x && String(x.name || '').trim(); });
  var allScored = list.length && list.every(function (x) { return isNum(toNum(x.score)); });
  if (!allScored) return list.map(function (x, i) { return { name: x.name, score: toNum(x.score), rank: i + 1, tie: false, note: x.note || '' }; });
  var sorted = list.map(function (x, i) { return { name: x.name, score: toNum(x.score), i: i, note: x.note || '' }; })
    .sort(function (a, b) { return b.score - a.score || a.i - b.i; });
  return sorted.map(function (x, i) {
    var rank = i + 1;
    for (var j = i - 1; j >= 0 && sorted[j].score === x.score; j--) rank = j + 1;
    var tie = sorted.some(function (y, k) { return k !== i && y.score === x.score; });
    return { name: x.name, score: x.score, rank: rank, tie: tie, note: x.note };
  });
}

/* ============================== динамика ============================== */

/**
 * Екі мәннің айырмасы.
 * unit: 'pp' — пайыздық тармақ, 'pt' — балл. better: 'up' | 'down' (мысалы қайта тапсыру үшін 'down').
 * Қайтарады: { state: 'up'|'down'|'same'|'na', diff, good, reason }.
 */
export function delta(cur, prev, unit, better) {
  if (!isNum(cur)) return { state: 'na', diff: null, good: null, unit: unit, reason: 'no_current' };
  if (!isNum(prev)) return { state: 'na', diff: null, good: null, unit: unit, reason: 'no_previous' };
  var diff = cur - prev;
  var rounded = Math.round(diff * 1e6) / 1e6;
  if (rounded === 0) return { state: 'same', diff: 0, good: null, unit: unit, cur: cur, prev: prev };
  var up = rounded > 0;
  return { state: up ? 'up' : 'down', diff: diff, good: (better || 'up') === 'up' ? up : !up, unit: unit, cur: cur, prev: prev };
}

/** Балл айырмасы: максимал балл өзгерсе, абсолют балл емес, максимумнан үлесі (п.т.) салыстырылады. */
export function scoreDelta(cur, curMax, prev, prevMax) {
  if (!isNum(cur)) return { state: 'na', diff: null, good: null, unit: 'pt', reason: 'no_current' };
  if (!isNum(prev)) return { state: 'na', diff: null, good: null, unit: 'pt', reason: 'no_previous' };
  if (isNum(curMax) && isNum(prevMax) && curMax !== prevMax) {
    if (curMax <= 0 || prevMax <= 0) return { state: 'na', diff: null, good: null, unit: 'pt', reason: 'max_unknown' };
    var d = delta((100 * cur) / curMax, (100 * prev) / prevMax, 'pp', 'up');
    d.normalized = true; d.curMax = curMax; d.prevMax = prevMax;
    return d;
  }
  if ((isNum(curMax) || isNum(prevMax)) && !(isNum(curMax) && isNum(prevMax))) {
    var d2 = delta(cur, prev, 'pt', 'up');
    d2.maxUnknown = true;
    return d2;
  }
  return delta(cur, prev, 'pt', 'up');
}

/* ============================== кезеңдер ============================== */

/**
 * Алдыңғы оқу аптасы: сол ағымның күнтізбесінде seq бойынша тікелей алдыңғы апта.
 * Ай ауысса да дұрыс табылады; айдағы апта саны жорамалданбайды. Алдыңғы апта жоқ болса — null.
 */
export function previousWeek(periods, current) {
  if (!current) return null;
  var best = null;
  (periods || []).forEach(function (p) {
    if (p.kind !== 'week' || p.stream_id !== current.stream_id || p.id === current.id) return;
    if (p.seq < current.seq && (!best || p.seq > best.seq)) best = p;
  });
  return best;
}

export function periodSeq(month, week) {
  return Number(month) * 100 + Number(week);
}

/* ============================== пішімдеу ============================== */

export function fmtNum(v, digits) {
  if (!isNum(v)) return '—';
  var d = digits == null ? 2 : digits;
  var f = Math.pow(10, d);
  var r = Math.round(v * f) / f;
  var s = r % 1 === 0 ? String(r) : r.toFixed(d).replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('-', '−').replace('.', ',');
}

export function fmtPct(v, digits) {
  return isNum(v) ? fmtNum(v, digits == null ? 2 : digits) + '%' : '—';
}

/** «−2,2 балл», «+2 п.т.» */
export function fmtDelta(d, digits) {
  if (!d || d.state === 'na') return '';
  if (d.state === 'same') return '0 ' + (d.unit === 'pp' ? 'п.т.' : 'балл');
  var s = fmtNum(Math.abs(d.diff), digits == null ? (d.unit === 'pp' ? 2 : 2) : digits);
  return (d.diff > 0 ? '+' : '−') + s + ' ' + (d.unit === 'pp' ? 'п.т.' : 'балл');
}
