// Бұрын импортталған СТ есептерінде «қателесті» үлесі бүтін санға дөңгелектеліп сақталған.
// Сақталған сандардан (қателескендер / жауап бергендер) үлесті 2 ондық таңбаға дейін қайта есептейді:
// импортталған сұрақтар статистикасы да, платформадан келген қиын тапсырмалар да. Ментордың мәтініне тиіспейді.
const round2 = (n) => Math.round(n * 100) / 100;

export function fixStData(data) {
  if (!data || !data.imported || !Array.isArray(data.imported.variants)) return { data, changed: false };
  let changed = false;
  const stats = new Map();
  for (const v of data.imported.variants) {
    for (const q of v.questions || []) {
      if (q.answered > 0 && Number.isFinite(q.wrong)) {
        const pct = round2((100 * q.wrong) / q.answered);
        if (q.pct !== pct) { q.pct = pct; changed = true; }
        if (q.key) stats.set(q.key, pct);
        stats.set(`${v.variant}:${q.q}`, pct);
      }
    }
  }
  for (const t of data.hardTasks || []) {
    if (!t.fromPlatform) continue;
    const pct = (t.key && stats.get(t.key)) ?? stats.get(`${t.variant}:${t.q}`);
    if (pct != null && t.wrongPct !== pct) { t.wrongPct = pct; changed = true; }
  }
  return { data, changed };
}

export async function up(q) {
  const { rows } = await q.query("select id, data, published from reports where type = 'st'");
  let n = 0;
  for (const r of rows) {
    const a = fixStData(r.data);
    let pub = r.published, b = { changed: false };
    if (pub && pub.data) { b = fixStData(pub.data); pub = { ...pub, data: b.data }; }
    if (!a.changed && !b.changed) continue;
    await q.query('update reports set data = $2::jsonb, published = $3::jsonb where id = $1', [r.id, JSON.stringify(a.data), pub ? JSON.stringify(pub) : null]);
    n++;
  }
  await q.query("insert into audit (actor, entity, action, after) values ('system', 'reports', 'migrate_st_wrong_pct', $1::jsonb)", [JSON.stringify({ reports: n })]);
}
