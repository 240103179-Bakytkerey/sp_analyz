// SapaLine (немесе бетбелгі/JSON) сабақтарын бір ЛС есебіне біріктіру. Негізгі ой lskb/src/merge.js-тен:
//  - сабақ source ID (SapaLine жол id-і) бойынша бір рет саналады; экспорттағы қайталану ескертіледі;
//  - қайта импорт сандарды жаңартады, ментордың пікірін, қорытындысын, бөлінісін өшірмейді;
//  - жаңа экспортта жоқ бұрынғы сабақ сақталады және ескертіледі;
//  - бос не мүлдем сәйкес келмейтін экспорт қабылданбайды — бұрынғы дұрыс дерек өзгермейді.
// lskb-дан айырмашылығы: пән мен желі кодқа бекітілмеген, ағым/комбинация/мұғалім сәйкестігі баптаудан.
import { httpError } from './http.js';
import { toNum, isNum } from './calc.js';

export const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase().replace(/ё/g, 'е');

/** Мұғалімнің SapaLine-дағы атымен сәйкестігі: толық аты, көрсетілетін аты, бүркеншік аттары, алғашқы екі сөздің кері реті. */
export function teacherMatches(teacher, name) {
  if (!teacher) return false;
  const n = norm(name);
  if (!n) return false;
  const swap = (s) => { const p = norm(s).split(' '); return p.length >= 2 ? [p[1], p[0], ...p.slice(2)].join(' ') : norm(s); };
  const two = (s) => norm(s).split(' ').slice(0, 2).join(' ');
  const cands = [teacher.full_name, teacher.display, ...(teacher.aliases || [])].filter(Boolean);
  return cands.some((c) => norm(c) === n || swap(c) === n || two(c) === two(n) || swap(two(c)) === two(n));
}

export function agymRule(config, agym) {
  const a = norm(agym);
  return (config.agym || []).find((r) => norm(r.agym) === a) || null;
}

/** SapaLine «stream» мәні: «ГЕОМАТ-1, ФИЗМАТ-1» → [{ code: 'ГЕОМАТ', n: 1 }, { code: 'ФИЗМАТ', n: 1 }].
 *  Соңғы сан — ағым нөмірі (1 → SP-1), алдындағысы — комбинация (топ) коды. */
export function parseAgym(agym) {
  return String(agym || '').split(/[,;/]+/).map((t) => t.trim()).filter(Boolean).map((t) => {
    const m = /^(.*?)[\s\-–—_]*(\d+)$/.exec(t);
    return m && m[1] ? { code: m[1].trim(), n: Number(m[2]) } : { code: t, n: null };
  });
}

/** Сабақтың ағымы мен комбинациялары: алдымен баптаудағы нақты ереже, болмаса кодтың өзінен. */
export function resolveAgym(row, ctx) {
  const rule = agymRule(ctx.config, row.agym);
  if (rule) return { stream: rule.stream || ctx.streamId, combos: (rule.combos || []).filter((c) => ctx.comboIds.has(c)), unknown: [], ruled: true };
  const tokens = parseAgym(row.agym);
  const streamOfN = (n) => (n == null ? null : (ctx.config.streamByNumber || {})[n] || `sp${n}`);
  const streams = [...new Set(tokens.map((t) => streamOfN(t.n)).filter(Boolean))];
  if (!streams.length) return ctx.divisionIsStream ? { stream: ctx.streamId, combos: [], unknown: [] } : null;
  if (!streams.includes(ctx.streamId)) return { stream: streams[0], combos: [], unknown: [] };
  const ignore = new Set((ctx.config.ignoreCodes || []).map(norm));
  const combos = [], unknown = [];
  tokens.filter((t) => streamOfN(t.n) === ctx.streamId).forEach((t) => {
    const id = (ctx.comboByCode || new Map()).get(norm(t.code));
    if (id) { if (!combos.includes(id)) combos.push(id); } else if (!ignore.has(norm(t.code))) unknown.push(t.code);
  });
  return { stream: ctx.streamId, combos, unknown, mixed: streams.length > 1 };
}

function surveyOf(row) {
  const s = row.survey || {};
  const liked = toNum(s.liked), avg = toNum(s.avg), disliked = toNum(s.disliked);
  const ok = [liked, avg, disliked].every((v) => isNum(v) && v >= 0 && Number.isInteger(v));
  return ok ? { liked, avg, disliked } : null;
}

/**
 * rows: [{ num, date, time, teacher, agym, topic, survey:{liked,avg,disliked}, present, total, att, understanding }]
 * ctx: { streamId, teacher, config, comboIds:Set, comboByCode:Map, divisionIsStream:boolean, importedAt, source }
 * existing: бұрынғы есеп data (немесе null)
 */
export function mergeLessons(existing, rows, ctx) {
  if (!Array.isArray(rows)) throw httpError(400, 'Импорт дерегінде «rows» тізімі жоқ.', 'bad_import');
  if (!rows.length) throw httpError(400, 'SapaLine бұл кезеңге бос тізім қайтарды — бұрынғы деректер өзгертілмеді.', 'empty_import');
  if (rows.length > 5000) throw httpError(400, 'Сабақтар тізімі тым үлкен.', 'bad_import');
  const warnings = [];
  const skipped = [];
  const seen = new Map();
  const incoming = [];
  const unknownCombos = new Set();
  let otherStream = 0, noCombo = 0;
  rows.forEach((row, i) => {
    if (!row || typeof row !== 'object') { skipped.push({ row: i + 1, reason: 'жол бүлінген' }); return; }
    const sourceId = String(row.num || row.id || '').trim() || [row.date, row.time, norm(row.teacher), norm(row.agym)].join('|');
    if (seen.has(sourceId)) { warnings.push(`Бір сабақ экспортта екі рет кездесті (${sourceId}) — біріншісі алынды.`); return; }
    seen.set(sourceId, true);
    const ag = resolveAgym(row, ctx);
    if (!ag) { skipped.push({ row: i + 1, reason: `«${row.agym || '—'}» ағым коды танылмады (соңында ағым нөмірі жоқ) — баптауда ереже қосыңыз`, agym: row.agym || '' }); return; }
    if (ag.stream !== ctx.streamId) { otherStream++; return; } // басқа ағымның сабағы
    if (!teacherMatches(ctx.teacher, row.teacher)) { skipped.push({ row: i + 1, reason: `мұғалім «${row.teacher || '—'}» тағайындалған мұғаліммен сәйкес келмеді`, teacher: row.teacher || '' }); return; }
    const combos = ag.combos;
    ag.unknown.forEach((c) => unknownCombos.add(c));
    if (ag.mixed) warnings.push(`«${row.agym}» сабағында бірнеше ағымның тобы бар — тек осы ағымның комбинациялары алынды.`);
    if (!combos.length) noCombo++;
    const present = toNum(row.present), total = toNum(row.total);
    if (isNum(present) && isNum(total) && present > total) warnings.push(`${row.date || ''} ${row.agym || ''}: қатысқан (${present}) жалпыдан (${total}) көп — сол күйінде есептеледі, қатысым 100%-дан асады.`);
    const survey = surveyOf(row);
    if (row.survey && !survey) warnings.push(`${row.date || ''} ${row.agym || ''}: сауалнама сандары қате — бұл сабақтың ұнатуы есептелмейді.`);
    incoming.push({
      sourceId, date: String(row.date || ''), time: String(row.time || ''), agym: String(row.agym || ''), topic: String(row.topic || ''), combos,
      present: isNum(present) && present >= 0 ? present : null,
      total: isNum(total) && total > 0 ? total : null,
      attendancePct: toNum(row.att),
      survey,
      understanding: row.understanding && typeof row.understanding === 'object' ? row.understanding : null,
    });
  });
  if (!incoming.length && otherStream && !skipped.length) {
    throw httpError(400, 'Бұл кезеңде осы ағымның сабағы жоқ (барлығы басқа ағымдікі) — бұрынғы деректер өзгертілмеді.', 'nothing_matched');
  }
  if (!incoming.length) {
    const e = httpError(400, 'Экспорттағы бірде-бір сабақ бұл ағым мен мұғалімге сәйкес келмеді — бұрынғы деректер өзгертілмеді. Ағым кодтары мен мұғалім атын баптаудан тексеріңіз.', 'nothing_matched');
    e.details = skipped.slice(0, 30).map((s) => `${s.row}-жол: ${s.reason}`);
    throw e;
  }

  const data = existing ? JSON.parse(JSON.stringify(existing)) : { lessons: [], difficulties: [], mentor: { summary: '', nextSteps: '' } };
  data.lessons = data.lessons || [];
  const byId = new Map(data.lessons.filter((l) => l.sourceId).map((l) => [l.sourceId, l]));
  let added = 0, updated = 0, kept = 0;
  for (const n of incoming) {
    const old = byId.get(n.sourceId);
    if (old) {
      updated++;
      old.date = n.date || old.date;
      old.time = n.time || old.time;
      old.agym = n.agym || old.agym;
      if (!old.topic && n.topic) old.topic = n.topic;
      if (!old.combosManual) old.combos = n.combos;
      // Жаңа экспортта бір көрсеткіш жоқ болса, оның бұрынғы мәні сақталады.
      if (n.present != null || n.total != null) { old.present = n.present; old.total = n.total; }
      if (n.attendancePct != null) old.attendancePct = n.attendancePct;
      if (n.survey) { old.liked = n.survey.liked; old.avg = n.survey.avg; old.disliked = n.survey.disliked; }
      if (n.understanding) old.understanding = { ...(old.understanding || {}), ...n.understanding };
      old.source = ctx.source || 'sapaline';
      old.importedAt = ctx.importedAt;
    } else {
      added++;
      data.lessons.push({
        id: `l_${n.sourceId}`.slice(0, 80), source: ctx.source || 'sapaline', sourceId: n.sourceId, date: n.date, time: n.time, topic: n.topic, agym: n.agym,
        combos: n.combos, excluded: false, present: n.present, total: n.total, attendancePct: n.attendancePct,
        liked: n.survey ? n.survey.liked : null, avg: n.survey ? n.survey.avg : null, disliked: n.survey ? n.survey.disliked : null,
        understanding: n.understanding || {}, split: {}, importedAt: ctx.importedAt,
      });
    }
  }
  const incomingIds = new Set(incoming.map((n) => n.sourceId));
  data.lessons.forEach((l) => {
    if ((l.source === 'sapaline' || l.source === 'json') && l.sourceId && !incomingIds.has(l.sourceId)) {
      kept++;
      warnings.push(`${l.date || ''} ${l.agym || ''} сабағы жаңа экспортта жоқ — бұрынғы мәні сақталды.`);
    }
  });
  data.lessons.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)));
  const noSurvey = incoming.filter((n) => !n.survey).length;
  const noAtt = incoming.filter((n) => n.present == null && n.attendancePct == null).length;
  if (noSurvey) warnings.push(`${noSurvey} сабақта сауалнама жоқ.`);
  if (noAtt) warnings.push(`${noAtt} сабақта қатысым дерегі жоқ.`);
  data.importInfo = { source: ctx.source || 'sapaline', importedAt: ctx.importedAt, by: ctx.actor || null, period: ctx.sourcePeriod || null, rows: rows.length };
  if (unknownCombos.size) warnings.unshift(`Анықтамалықта жоқ комбинация кодтары: ${[...unknownCombos].join(', ')}. Оларды комбинация ретінде қоссаңыз (немесе «комбинация емес» деп белгілесеңіз), қайта импорттағанда ескеріледі.`);
  if (noCombo) warnings.push(`${noCombo} сабақтың комбинациясы анықталмады — олар тек «Барлығы» көрінісіне кіреді.`);
  return { data, summary: { lessons: incoming.length, added, updated, kept, skipped, warnings, unknownCombos: [...unknownCombos], otherStream } };
}
