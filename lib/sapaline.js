// SapaLine-нан ЛС деректерін тек оқу. Негізі: lskb/api/sapaline.js.
// lskb-да division (smart/junior) және пәндер (math/geometry) кодқа бекітілген еді; мұнда барлығы
// баптауда: division әр ағымға, пән коды subjects.sapaline_code бағанында, ағым/комбинация
// сәйкестігі import_mappings (sapaline/config) ішінде. SMART PRO-ның нақты division мәні мен
// пән кодтары әзірлеу кезінде тексерілмеді (SapaLine аккаунты берілмеді) — оларды әкімші
// «Анықтау» батырмасымен SapaLine-ның өзінен көріп, баптауға жазады.
//
// Айнымалылар: SAPALINE_EMAIL, SAPALINE_PASSWORD (міндетті), SAPALINE_URL, SAPALINE_ANON_KEY (міндетті емес).
import { httpError } from './http.js';

const DEFAULT_URL = 'https://vmmmtujfuxrfzsbgoxow.supabase.co';
// SapaLine веб-қосымшасы әр келушіге беретін жалпыға ашық (anon) кілт — lskb-дағымен бірдей.
// Ол жалғыз ештеңе ашпайды: қолжетімділікті сервистік аккаунт береді.
const DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtbW10dWpmdXhyZnpzYmdveG93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NTkzOTAsImV4cCI6MjA5MDQzNTM5MH0.5ZpzPCyppXTKWc1vY5yrselmdYtmdHQqPNfnfBiaKDo';

export function sapalineConfig() {
  const url = (process.env.SAPALINE_URL || DEFAULT_URL).replace(/\/+$/, '');
  const anon = process.env.SAPALINE_ANON_KEY || DEFAULT_ANON;
  const email = process.env.SAPALINE_EMAIL || '';
  const password = process.env.SAPALINE_PASSWORD || '';
  return { url, anon, email, password, configured: Boolean(email && password) };
}

let cached = { token: null, exp: 0 };
export function resetSapalineToken() { cached = { token: null, exp: 0 }; }

async function login(cfg) {
  const now = Date.now();
  if (cached.token && cached.exp - 60_000 > now) return cached.token;
  let r;
  try {
    r = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: cfg.anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cfg.email, password: cfg.password }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw httpError(502, 'SapaLine серверіне қосыла алмадық. Кейінірек қайталаңыз.', 'sapaline_unreachable');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    const msg = r.status === 400 ? 'SapaLine логин/құпиясөзі қабылданбады: SAPALINE_EMAIL, SAPALINE_PASSWORD айнымалыларын тексеріңіз.' : `SapaLine-ға кіру сәтсіз аяқталды (${r.status}).`;
    throw httpError(r.status === 400 ? 401 : 502, msg, 'sapaline_login_failed');
  }
  cached = { token: j.access_token, exp: now + (Number(j.expires_in) || 3600) * 1000 };
  return cached.token;
}

async function rest(cfg, path, retried) {
  const token = await login(cfg);
  let r;
  try {
    r = await fetch(`${cfg.url}/rest/v1/${path}`, { headers: { apikey: cfg.anon, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw httpError(502, 'SapaLine серверіне қосыла алмадық. Кейінірек қайталаңыз.', 'sapaline_unreachable');
  }
  if (r.status === 401 && !retried) {
    resetSapalineToken();
    return rest(cfg, path, true);
  }
  if (!r.ok) throw httpError(502, `SapaLine деректерін оқу сәтсіз аяқталды (${r.status}).`, 'sapaline_read_failed');
  return r.json();
}

const enc = encodeURIComponent;

// SapaLine сауалнамасы: { unady, ortasha, unamady, jalpy, qatysty, … }; survey_auto — автоматты сандар,
// қолмен түзетілген survey оларды кілт бойынша басады (lskb-дағыдай).
function mergedSurvey(row) {
  const out = Object.assign({}, row.survey_auto || {});
  const s = row.survey || {};
  for (const k of Object.keys(s)) if (s[k] != null) out[k] = s[k];
  return out;
}
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null);

/** SapaLine жолы → импорт пішімі (lskb бетбелгісінің v2 пішімімен бірдей + түсіну санаттары). */
export function toPayloadRow(row, understandingKeys) {
  const s = mergedSurvey(row);
  const out = {
    num: String(row.id),
    date: row.lesson_date || '',
    time: String(row.time_from || '').slice(0, 5),
    teacher: String(row.teacher || '').trim(),
    agym: String(row.stream || '').trim(),
    topic: String(row.topic || row.theme || '').trim(),
  };
  const liked = num(s.unady), avg = num(s.ortasha), disliked = num(s.unamady);
  if (liked != null && avg != null && disliked != null) out.survey = { liked, avg, disliked };
  const present = num(s.qatysty), total = num(s.jalpy);
  if (present != null) out.present = present;
  if (total != null) out.total = total;
  // Түсіну деңгейі: SapaLine-дағы кілттері баптауда берілсе ғана оқылады (жорамалмен оқылмайды).
  if (understandingKeys && Object.keys(understandingKeys).length) {
    const u = {};
    let any = false;
    for (const [k, src] of Object.entries(understandingKeys)) {
      const v = src ? num(s[src]) : null;
      if (v != null) { u[k] = v; any = true; }
    }
    if (any) out.understanding = u;
  }
  return out;
}

export async function sapalinePeriods(division) {
  const cfg = sapalineConfig();
  if (!cfg.configured) throw notConfigured();
  if (!division) throw httpError(400, 'Бұл ағымға SapaLine division мәні бапталмаған (Әкімші → Импорт баптауы).', 'sapaline_no_division');
  const rows = await rest(cfg, `live_sabaq_periods?division=eq.${enc(division)}&select=id,month,week`);
  return (rows || [])
    .map((p) => ({ id: p.id, month: Number(p.month), week: Number(p.week), label: `${p.month}-ай ${p.week}-апта` }))
    .filter((p) => p.month >= 1 && p.week >= 1)
    .sort((a, b) => b.month * 100 + b.week - (a.month * 100 + a.week));
}

export async function sapalineRows({ division, subjectCode, periodId, understandingKeys }) {
  const cfg = sapalineConfig();
  if (!cfg.configured) throw notConfigured();
  if (!subjectCode) throw httpError(400, 'Пәннің SapaLine коды бапталмаған (Әкімші → Анықтамалық → Пәндер → SapaLine коды).', 'sapaline_no_subject');
  const rows = await rest(cfg, `live_sabaq_rows?division=eq.${enc(division)}&subject=eq.${enc(subjectCode)}&period_id=eq.${enc(periodId)}&select=*&order=position`);
  return (rows || []).map((r) => toPayloadRow(r, understandingKeys));
}

/** Баптауға көмек: SapaLine-да қандай division / subject / stream / teacher мәндері бар екенін көрсетеді. */
export async function sapalineDiscover({ division, periodId } = {}) {
  const cfg = sapalineConfig();
  if (!cfg.configured) throw notConfigured();
  const periods = await rest(cfg, 'live_sabaq_periods?select=division,id,month,week&order=month.desc,week.desc&limit=2000');
  const divisions = [...new Set((periods || []).map((p) => p.division).filter(Boolean))].sort();
  const out = { divisions, periods: [], subjects: [], streams: [], teachers: [], surveyKeys: [] };
  if (division) {
    out.periods = (periods || []).filter((p) => p.division === division).map((p) => ({ id: p.id, label: `${p.month}-ай ${p.week}-апта` }));
    const pid = periodId || (out.periods[0] && out.periods[0].id);
    if (pid) {
      const rows = await rest(cfg, `live_sabaq_rows?division=eq.${enc(division)}&period_id=eq.${enc(pid)}&select=subject,stream,teacher,survey,survey_auto&limit=3000`);
      const uniq = (f) => [...new Set((rows || []).map(f).filter(Boolean).map((s) => String(s).trim()))].sort();
      out.subjects = uniq((r) => r.subject);
      out.streams = uniq((r) => r.stream);
      out.teachers = uniq((r) => r.teacher);
      out.surveyKeys = [...new Set((rows || []).flatMap((r) => Object.keys(Object.assign({}, r.survey_auto || {}, r.survey || {}))))].sort();
      out.periodId = pid;
    }
  }
  return out;
}

function notConfigured() {
  return httpError(503, 'SapaLine сервистік аккаунты бапталмаған: SAPALINE_EMAIL және SAPALINE_PASSWORD айнымалыларын қосыңыз. Оған дейін JSON/қолмен енгізу жолы жұмыс істейді.', 'sapaline_not_configured');
}
