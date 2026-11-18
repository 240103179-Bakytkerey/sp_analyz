// Көрушіге арналған жинақ: сүзгілерге сай жарияланған есептер, әр есептің көрсеткіштері
// және алдыңғы салыстырмалы кезеңмен динамикасы. Динамика әр сұраныста жаңадан есептеледі.
import { db } from './db.js';
import { getCatalog, periodKey, assignmentAt } from './repo.js';
import { lsAggregate, stOverall, stRetakeOverall, stCombo, delta, scoreDelta, previousWeek, rankTop, isNum } from './calc.js';

const byId = (arr) => new Map(arr.map((x) => [x.id, x]));

/** Есептің көрушіге көрінетін нұсқасы: жарияланған көшірме (немесе алдын ала қарауда — жоба). */
function visible(rep, drafts) {
  if (drafts) return { data: rep.data, teacher_id: rep.teacher_id, draft: rep.status !== 'published' || rep.dirty };
  if (rep.status !== 'published' || !rep.published) return null;
  return { data: rep.published.data, teacher_id: rep.published.teacher_id, draft: false };
}

function combosInLs(data) {
  const set = new Set();
  (data.lessons || []).forEach((l) => { (l.combos || []).forEach((c) => set.add(c)); Object.keys(l.split || {}).forEach((c) => set.add(c)); });
  return [...set];
}

export function lsMetrics(data, combo) {
  const a = lsAggregate(data.lessons, combo || null);
  return { kind: 'ls', ...a };
}

export function stMetrics(data, combo) {
  if (combo) {
    const c = stCombo(data, combo);
    return c ? { kind: 'st', level: 'combo', score: c.score, max: c.max, submitted: c.submitted, retake: c.retake, note: c.note, source: 'combo' } : { kind: 'st', level: 'combo', missing: true };
  }
  const o = stOverall(data);
  return { kind: 'st', level: 'all', score: o.score, max: o.max, submitted: o.submitted, total: o.total, source: o.source, reason: o.reason || null, retake: stRetakeOverall(data) };
}

function lsDynamics(cur, prev) {
  return {
    like: delta(cur.like.pct, prev.like.pct, 'pp', 'up'),
    attendance: delta(cur.attendance.pct, prev.attendance.pct, 'pp', 'up'),
    attendanceModeChanged: cur.attendance.mode && prev.attendance.mode && cur.attendance.mode !== prev.attendance.mode,
  };
}

function stDynamics(cur, prev) {
  return {
    score: scoreDelta(cur.score, cur.max, prev.score, prev.max),
    retake: delta(cur.retake && cur.retake.pct, prev.retake && prev.retake.pct, 'pp', 'down'),
  };
}

function teacherOut(t) {
  return t ? { id: t.id, name: t.display || t.full_name, fullName: t.full_name, photo: t.photo || null } : null;
}

/**
 * opts: { type, stream, subject, period, combo, drafts, user }
 * stream/subject/combo: id немесе 'all'.
 */
export async function buildView(opts) {
  const d = await db();
  const cat = await getCatalog(d);
  const type = ['ls', 'st', 'bt'].includes(opts.type) ? opts.type : 'ls';
  const drafts = !!opts.drafts;
  const streams = byId(cat.streams), subjects = byId(cat.subjects), teachers = byId(cat.teachers), periods = byId(cat.periods), combos = byId(cat.combinations);
  // 1-қадам: жеңіл тізім (есептің мазмұнынсыз) — қай кезеңде не бар екенін анықтау үшін ғана.
  // Есептер көбейгенде де сұраныс жылдам қалады: ауыр JSON тек керек есептер үшін оқылады (2-қадам).
  const { rows } = await d.query(
    `select id, type, stream_id, subject_id, teacher_id, period_id, scope, status, published_rev, published_at, published_by, demo, updated_at, updated_by,
            (published is not null) as has_pub, (status = 'published' and published->'data' is distinct from data) as dirty,
            published->>'teacher_id' as pub_teacher
       from reports where type = $1`, [type]);
  const reps = rows
    .map((r) => ({ r, v: visibleMeta(r, drafts), p: periods.get(r.period_id) }))
    .filter((x) => x.v && x.p);

  const streamOk = (id) => !opts.stream || opts.stream === 'all' || opts.stream === id;
  const subjectOk = (id) => type === 'bt' || !opts.subject || opts.subject === 'all' || opts.subject === id;
  const filtered = reps.filter((x) => streamOk(x.r.stream_id) && subjectOk(x.r.subject_id));

  // Таңдауға болатын кезеңдер (сүзгіге сай дерегі бар): кілт бойынша біріктіріледі.
  const pmap = new Map();
  filtered.forEach((x) => {
    const k = periodKey(x.p);
    const e = pmap.get(k) || { key: k, label: x.p.label, kind: x.p.kind, seq: x.p.seq, month: x.p.month, week: x.p.week, test_date: x.p.test_date, streams: [], drafts: false };
    if (!e.streams.includes(x.r.stream_id)) e.streams.push(x.r.stream_id);
    e.seq = Math.max(e.seq, x.p.seq);
    if (x.v.draft) e.drafts = true;
    pmap.set(k, e);
  });
  const periodList = [...pmap.values()].sort((a, b) => a.seq - b.seq);
  const sel = periodList.find((p) => p.key === opts.period) || periodList[periodList.length - 1] || null;
  const combo = opts.combo && opts.combo !== 'all' && combos.has(opts.combo) ? opts.combo : null;

  const out = {
    type,
    periods: periodList,
    period: sel ? sel.key : null,
    combo: combo || 'all',
    drafts,
    entries: [],
    bt: [],
  };
  if (!sel) return out;
  const inPeriod = filtered.filter((x) => periodKey(x.p) === sel.key);

  // 2-қадам: мазмұн тек таңдалған кезеңнің есептеріне және динамика үшін керек алдыңғы есептерге оқылады.
  const need = new Set(inPeriod.map((x) => x.r.id));
  if (type === 'bt') {
    const st = new Set(inPeriod.map((x) => x.r.stream_id));
    reps.forEach((y) => { if (st.has(y.r.stream_id) && y.p.seq < sel.seq) need.add(y.r.id); });
  } else {
    inPeriod.forEach((x) => {
      const prevP = previousWeek(cat.periods, x.p);
      if (!prevP) return;
      const pr = reps.find((y) => y.r.stream_id === x.r.stream_id && (y.r.subject_id || null) === (x.r.subject_id || null) && y.r.period_id === prevP.id);
      if (pr) need.add(pr.r.id);
    });
  }
  if (need.size) {
    const full = await d.query('select id, data, published from reports where id = any($1::text[])', [[...need]]);
    const byRep = new Map(full.rows.map((r) => [r.id, r]));
    reps.forEach((x) => { const f = byRep.get(x.r.id); if (f) x.v.data = drafts ? f.data : f.published && f.published.data; });
  }
  // «Барлық пәндер» сияқты көп бөлімді көріністе СТ тапсырмалары кейін (бөлім экранға жақындағанда) жүктеледі.
  const lazyTasks = type === 'st' && inPeriod.length > 3;


  const findReport = (streamId, subjectId, period, scope) =>
    reps.find((x) => x.r.stream_id === streamId && (x.r.subject_id || null) === (subjectId || null) && x.r.period_id === period.id && (scope == null || x.r.scope === scope));

  if (type === 'ls' || type === 'st') {
    for (const x of inPeriod) {
      const data = x.v.data || {};
      const metricsOf = (c) => (type === 'ls' ? lsMetrics(data, c) : stMetrics(data, c));
      const cur = metricsOf(combo);
      const comboIds = type === 'ls' ? combosInLs(data) : (data.combos || []).map((c) => c.comboId);
      const breakdown = comboIds.filter((c) => combos.has(c)).map((c) => ({ comboId: c, metrics: metricsOf(c) }));
      // Динамика: тек тікелей алдыңғы оқу аптасы, сол ағым, сол пән, сол деңгей.
      const prevP = previousWeek(cat.periods, x.p);
      let dyn;
      if (!prevP) dyn = { status: 'no_prev_period' };
      else {
        const pr = findReport(x.r.stream_id, x.r.subject_id, prevP);
        if (!pr) dyn = { status: 'no_prev_data', prevPeriod: { id: prevP.id, label: prevP.label } };
        else {
          const prevM = type === 'ls' ? lsMetrics(pr.v.data || {}, combo) : stMetrics(pr.v.data || {}, combo);
          const flags = [];
          if (pr.v.teacher_id !== x.v.teacher_id) flags.push({ code: 'teacher_changed', prevTeacher: teacherOut(teachers.get(pr.v.teacher_id)) });
          if (type === 'ls' && !combo) {
            const a = combosInLs(pr.v.data || {}).sort().join(','), b = comboIds.slice().sort().join(',');
            if (a !== b) flags.push({ code: 'composition_changed' });
          }
          if (combo && prevM.missing) dyn = { status: 'no_prev_combo', prevPeriod: { id: prevP.id, label: prevP.label }, flags };
          else dyn = { status: 'ok', prevPeriod: { id: prevP.id, label: prevP.label }, prevDraft: pr.v.draft, prev: prevM, flags, ...(type === 'ls' ? lsDynamics(cur, prevM) : stDynamics(cur, prevM)) };
        }
      }
      const subj = subjects.get(x.r.subject_id), str = streams.get(x.r.stream_id);
      out.entries.push({
        id: x.r.id,
        key: `${x.r.stream_id}.${x.r.subject_id}`,
        type,
        draft: x.v.draft,
        demo: x.r.demo,
        stream: { id: str.id, name: str.name, short: str.short, sort: str.sort },
        subject: { id: subj.id, name: subj.name, short: subj.short, glyph: subj.glyph, sort: subj.sort, color: subj.color || null, logo: subj.logo || null },
        teacher: teacherOut(teachers.get(x.v.teacher_id)),
        period: { id: x.p.id, label: x.p.label, key: sel.key },
        metrics: cur,
        breakdown,
        dynamics: dyn,
        data: publicData(type, data, lazyTasks),
        updatedAt: x.r.updated_at,
        updatedBy: x.r.updated_by,
        publishedAt: x.r.published_at,
        publishedRev: x.r.published_rev,
      });
    }
    out.entries.sort((a, b) => a.stream.sort - b.stream.sort || a.subject.sort - b.subject.sort);
    if (combo) out.entries = out.entries.filter((e) => e.breakdown.some((b) => b.comboId === combo) || (e.metrics.shared && e.metrics.shared.length));
    return out;
  }

  // ---------------- БТ ----------------
  for (const x of inPeriod) {
    if (combo && x.r.scope !== combo) continue;
    const data = x.v.data || {};
    // Алдыңғы салыстырмалы БТ: сол ағым, сол scope, ертерек, «салыстыруға жарамды» белгісі бар.
    const prevCands = reps
      .filter((y) => y.r.stream_id === x.r.stream_id && y.r.scope === x.r.scope && y.p.kind === 'bt' && y.p.seq < x.p.seq && (y.v.data || {}).comparable !== false)
      .sort((a, b) => b.p.seq - a.p.seq);
    const pr = data.comparable === false ? null : prevCands[0] || null;
    const flags = [];
    if (pr && (pr.p.cohort || x.p.cohort) && pr.p.cohort !== x.p.cohort) flags.push({ code: 'cohort_changed', prev: pr.p.cohort, cur: x.p.cohort });
    const prevData = pr ? pr.v.data || {} : null;
    const subjectsOut = (data.subjects || []).map((s) => {
      const subj = s.subjectId ? subjects.get(s.subjectId) : null;
      const a = s.subjectId ? assignmentAt(cat, x.r.stream_id, s.subjectId, x.p.test_date || x.p.date_from) : null;
      const ps = prevData ? (prevData.subjects || []).find((p) => (s.subjectId ? p.subjectId === s.subjectId : !p.subjectId && p.label === s.label)) : null;
      return {
        subjectId: s.subjectId,
        label: subj ? subj.name : s.label,
        short: subj ? subj.short : s.label,
        glyph: subj ? subj.glyph : '',
        color: subj ? subj.color || null : null,
        logo: subj ? subj.logo || null : null,
        extra: !subj,
        teacher: a ? teacherOut(teachers.get(a.teacher_id)) : null,
        avg: s.avg, max: s.max, participants: s.participants,
        top3: rankTop(s.top3),
        hardTopics: s.hardTopics || [],
        recommendation: s.recommendation || '',
        dynamics: !pr ? { status: 'no_prev_bt' } : !ps ? { status: 'no_prev_subject', prevPeriod: { label: pr.p.label } } : { status: 'ok', prevPeriod: { label: pr.p.label }, score: scoreDelta(s.avg, s.max, ps.avg, ps.max), prev: { avg: ps.avg, max: ps.max } },
      };
    });
    const str = streams.get(x.r.stream_id);
    out.bt.push({
      id: x.r.id,
      draft: x.v.draft,
      demo: x.r.demo,
      stream: { id: str.id, name: str.name, short: str.short, sort: str.sort },
      scope: x.r.scope === 'all' ? null : { id: x.r.scope, code: (combos.get(x.r.scope) || {}).code || x.r.scope, name: (combos.get(x.r.scope) || {}).name || '' },
      period: { id: x.p.id, label: x.p.label, testDate: x.p.test_date, cohort: x.p.cohort, key: sel.key },
      participants: data.participants,
      overall: data.overall || {},
      top3: rankTop(data.top3),
      hardTopics: data.hardTopics || [],
      analysis: data.analysis || '',
      actionPlan: data.actionPlan || '',
      comparable: data.comparable !== false,
      subjects: opts.subject && opts.subject !== 'all' ? subjectsOut.filter((s) => s.subjectId === opts.subject) : subjectsOut,
      allSubjects: subjectsOut.length,
      dynamics: data.comparable === false ? { status: 'not_comparable' } : !pr ? { status: 'no_prev_bt' } : { status: 'ok', prevPeriod: { label: pr.p.label }, score: scoreDelta(data.overall && data.overall.avg, data.overall && data.overall.max, prevData.overall && prevData.overall.avg, prevData.overall && prevData.overall.max), prev: prevData.overall || {}, flags },
      updatedAt: x.r.updated_at,
      updatedBy: x.r.updated_by,
      publishedRev: x.r.published_rev,
    });
  }
  out.bt.sort((a, b) => a.stream.sort - b.stream.sort || (a.scope ? 1 : 0) - (b.scope ? 1 : 0));
  return out;
}

/** Есептің көрушіге көрінуі мазмұнсыз анықталады (жеңіл тізім үшін). */
function visibleMeta(r, drafts) {
  if (drafts) return { teacher_id: r.teacher_id, draft: r.status !== 'published' || r.dirty, data: null };
  if (r.status !== 'published' || !r.has_pub) return null;
  return { teacher_id: r.pub_teacher || r.teacher_id, draft: false, data: null };
}

/** Бір СТ есебінің қиын тапсырмалары (кейін жүктеу үшін). Көріну ережесі /api/view-пен бірдей. */
export async function reportTasks(id, drafts) {
  const d = await db();
  const r = (await d.query("select status, data, published from reports where id = $1 and type = 'st'", [id])).rows[0];
  if (!r) return null;
  const data = drafts ? r.data : r.status === 'published' && r.published ? r.published.data : null;
  return data ? { hardTasks: data.hardTasks || [] } : null;
}

/** Көрушіге берілетін есеп мазмұны (ішкі импорт мәліметтерінсіз). lazy — тапсырмалардың тек саны. */
function publicData(type, data, lazy) {
  if (type === 'ls') {
    return {
      lessons: (data.lessons || []).filter((l) => !l.excluded).map((l) => ({ date: l.date, time: l.time, topic: l.topic, combos: l.combos, present: l.present, total: l.total, attendancePct: l.attendancePct, liked: l.liked, avg: l.avg, disliked: l.disliked, hasSplit: Object.keys(l.split || {}).length > 0, source: l.source })),
      difficulties: data.difficulties || [],
      mentor: data.mentor || {},
      importedAt: data.importInfo && data.importInfo.importedAt,
      source: data.importInfo ? data.importInfo.source : 'manual',
    };
  }
  const imp = data.imported || null;
  return {
    hardTasks: lazy ? null : data.hardTasks || [],
    taskCount: (data.hardTasks || []).length,
    topics: data.topics && data.topics.length ? data.topics : (imp && imp.topics) || [],
    mentor: data.mentor || {},
    groups: imp ? imp.groups || [] : [],
    lessonName: imp ? imp.lessonName : '',
    importedAt: imp ? imp.importedAt : null,
    scoreMethod: imp ? imp.scoreMethod || null : null,
    groupCount: imp ? imp.groupCount || null : null,
    combos: (data.combos || []).map((c) => ({ comboId: c.comboId, note: c.note })),
  };
}

export { isNum };
