// Telegram-дағы бұрынғы есеп мәтінін форма өрістеріне алдын ала бөлу.
// Нәтиже ешқашан сақталмайды және жарияланбайды: ол тек жобаның бастапқы толтыруы, әр өріс
// сенімділік белгісімен (high/low) қайтады, ментор тексеріп барып сақтайды.

const N = '(\\d+(?:[.,]\\d+)?)';
const num = (s) => (s == null ? null : Number(String(s).replace(',', '.')));

function norm(s) {
  return String(s || '').replace(/[–—]/g, '-').replace(/ /g, ' ');
}

export function parseTelegram(textIn, type, catalog) {
  const text = norm(textIn).slice(0, 20000);
  const low = text.toLowerCase();
  const found = [];
  const note = (field, value, conf, src) => found.push({ field, value, confidence: conf, source: String(src || '').trim().slice(0, 120) });
  const out = { type, stream_id: null, subject_id: null, period: null, combos: [], data: {} };

  // ағым
  const sm = /(?:smart\s*pro|sp)\s*-?\s*([123])\b/i.exec(text);
  if (sm) { const s = (catalog.streams || []).find((x) => x.id === 'sp' + sm[1]); if (s) { out.stream_id = s.id; note('stream_id', s.id, 'high', sm[0]); } }
  // кезең
  const pm = /(\d{1,2})\s*-?\s*ай\D{0,6}(\d)\s*-?\s*апта/i.exec(text);
  if (pm) { out.period = { month: +pm[1], week: +pm[2] }; note('period', `${pm[1]}-ай ${pm[2]}-апта`, 'high', pm[0]); }
  // пән: ұзын атаулар бірінші тексеріледі («Математикалық сауаттылық» ≠ «Математика»)
  const subs = (catalog.subjects || []).slice().sort((a, b) => b.name.length - a.name.length);
  for (const s of subs) {
    if (low.includes(s.name.toLowerCase())) { out.subject_id = s.id; note('subject_id', s.id, 'high', s.name); break; }
  }
  // комбинациялар (код дербес сөз ретінде)
  for (const c of catalog.combinations || []) {
    const re = new RegExp(`(^|[^\\p{L}])${c.code}([^\\p{L}]|$)`, 'u');
    if (re.test(text)) { out.combos.push(c.id); note('combos', c.code, 'low', c.code); }
  }
  // мұғалім
  for (const t of catalog.teachers || []) {
    if (low.includes(t.full_name.toLowerCase())) { out.teacher_id = t.id; note('teacher_id', t.full_name, 'high', t.full_name); break; }
  }

  if (type === 'ls') {
    const lesson = { combos: out.combos.slice(), understanding: {} };
    const att = /(?:қатыс\S*)[^\d\n]{0,20}(\d+)\s*\/\s*(\d+)/i.exec(text) || /(\d+)\s*\/\s*(\d+)/.exec(text);
    if (att) { lesson.present = +att[1]; lesson.total = +att[2]; note('present/total', `${att[1]} / ${att[2]}`, /қатыс/i.test(att[0]) ? 'high' : 'low', att[0]); }
    const grab = (re, key, label) => { const m = re.exec(text); if (m) { lesson[key] = +m[1]; note(label, m[1], 'high', m[0]); } };
    grab(/ұнамады\s*[:\-–]?\s*(\d+)/i, 'disliked', 'Ұнамады');
    grab(/(?<!ұ)(?<!\S)ұнады\s*[:\-–]?\s*(\d+)/i, 'liked', 'Ұнады');
    grab(/орташа\s*[:\-–]?\s*(\d+)(?!\s*[.,]\d)/i, 'avg', 'Орташа');
    const bands = [['u90', '90\\s*-\\s*100'], ['u80', '80\\s*-\\s*90'], ['u70', '70\\s*-\\s*80'], ['u60', '60\\s*-\\s*70'], ['u50', '50\\s*-\\s*60'], ['u0', '0\\s*-\\s*50']];
    for (const [k, r] of bands) {
      const m = new RegExp(`(?<![\\d])${r}\\s*%?[^\\d\\n]{0,25}(\\d+)`, 'i').exec(text);
      if (m) { lesson.understanding[k] = +m[1]; note('түсіну ' + k, m[1], 'low', m[0]); }
    }
    const summary = /(?:қорытынды|ментор пікірі)\s*[:\-–]\s*([\s\S]{3,600}?)(?:\n\s*\n|$)/i.exec(text);
    const next = /(?:ұсыныс\S*|келесі қадам\S*)\s*[:\-–]\s*([\s\S]{3,600}?)(?:\n\s*\n|$)/i.exec(text);
    out.data = { lessons: [lesson], difficulties: [], mentor: { summary: summary ? summary[1].trim() : '', nextSteps: next ? next[1].trim() : '' } };
    if (summary) note('mentor.summary', '…', 'low', summary[0]);
    if (next) note('mentor.nextSteps', '…', 'low', next[0]);
  } else if (type === 'st') {
    const data = { overall: {}, combos: [], retake: {}, hardTasks: [], mentor: {} };
    const sc = new RegExp(`(?:ортақ|орташа)\\s*балл\\S*\\s*[:\\-–]?\\s*${N}`, 'i').exec(text);
    if (sc) { data.overall.score = num(sc[1]); note('overall.score', sc[1], 'high', sc[0]); }
    const mx = new RegExp(`${N}\\s*/\\s*(\\d+)\\s*балл`, 'i').exec(text);
    if (mx) { data.overall.max = num(mx[2]); note('overall.max', mx[2], 'low', mx[0]); }
    // «БХ комбинациясында қайта тапсыру: 25 оқушы, 42%»
    for (const c of catalog.combinations || []) {
      const re = new RegExp(`${c.code}[^\\n]{0,60}?қайта\\s*тапсыр\\S*[^\\d\\n]{0,15}(\\d+)\\s*оқушы[^\\d\\n]{0,10}(?:${N}\\s*%)?`, 'iu');
      const m = re.exec(text);
      if (m) {
        data.combos.push({ comboId: c.id, retakeCount: +m[1], retakeBase: null, retakePct: m[2] ? num(m[2]) : null });
        note(`${c.code} қайта тапсыру`, `${m[1]} оқушы${m[2] ? ', ' + m[2] + '%' : ''}`, 'high', m[0]);
      }
    }
    if (!data.combos.length) {
      const m = new RegExp(`қайта\\s*тапсыр\\S*[^\\d\\n]{0,15}(\\d+)\\s*оқушы[^\\d\\n]{0,10}(?:${N}\\s*%)?`, 'i').exec(text);
      if (m) { data.retake = { retakeCount: +m[1], retakeBase: null, retakePct: m[2] ? num(m[2]) : null }; note('retake', m[0], 'low', m[0]); }
    }
    const rec = /(?:келесі аптаға ұсыныс|ұсыныс\S*)\s*[:\-–]\s*([\s\S]{3,1500}?)(?:\n\s*\n|$)/i.exec(text);
    if (rec) { data.mentor.recommendation = rec[1].trim(); note('mentor.recommendation', '…', 'low', rec[0]); }
    out.data = data;
  } else if (type === 'bt') {
    const data = { overall: {}, subjects: [], top3: [] };
    const o = new RegExp(`(?:жалпы\\s*)?(?:ортақ|орташа)\\s*балл\\S*\\s*[:\\-–]?\\s*${N}`, 'i').exec(text);
    if (o) { data.overall.avg = num(o[1]); note('overall.avg', o[1], 'low', o[0]); }
    for (const s of subs) {
      const m = new RegExp(`${s.name}\\s*[:\\-–]\\s*${N}`, 'i').exec(text);
      if (m) { data.subjects.push({ subjectId: s.id, avg: num(m[1]), top3: [], hardTopics: [] }); note(s.name, m[1], 'low', m[0]); }
    }
    out.data = data;
  }
  return { draft: out, found, note: 'Бұл тек алдын ала толтыру. Әр мәнді тексеріңіз; сенімсіз (low) өрістер сарымен белгіленеді. Ештеңе автоматты түрде сақталмайды және жарияланбайды.' };
}
