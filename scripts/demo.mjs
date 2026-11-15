// ДЕМО ДЕРЕКТЕР: дизайн мен есептеуді көрсету үшін бірнеше есеп жүктейді (бәрі demo=true деп белгіленеді,
// сайтта «Демо деректер» белгісімен шығады). Сандар тек промпттағы нақты үлгілерден алынған:
//   ЛС — SMART PRO-1, Химия, 5-ай 2-апта, БХ+ФХ ортақ сабақ, 56/61, 46/0/0, түсіну 45 және 1;
//   СТ — SMART PRO-2, Химия, 4-ай 1-апта: 16,2 балл (алдыңғы 18,4), БХ қайта тапсыру 25 оқушы, 42%.
// БТ үлгісінде нақты сан берілмегендіктен, ол «Демо» оқушы аттарымен тек пішінді көрсетеді.
//   npm run demo            — жүктеу
//   npm run demo -- --remove — барлық демо есепті өшіру
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
loadEnv(ROOT);
const { db } = await import('../lib/db.js');
const repo = await import('../lib/repo.js');
const d = await db();
const actor = { id: 'system', username: 'demo', role: 'admin', scope: {} };

if (process.argv.includes('--remove')) {
  const { rows } = await d.query('delete from reports where demo = true returning id');
  console.log(`Өшірілді: ${rows.length} демо есеп`);
  await d.close();
  process.exit(0);
}

async function put(input) {
  let rep;
  try {
    rep = (await repo.createReport(actor, { ...input, demo: true })).report;
  } catch (e) {
    if (e.code === 'exists') { console.log('бар:', input.type, input.stream_id, input.subject_id || input.scope); return; }
    throw e;
  }
  await repo.publishReport(actor, rep.id, rep.version);
  console.log('жүктелді:', input.type, input.stream_id, input.subject_id || input.scope);
}

await put({
  type: 'ls', stream_id: 'sp1', subject_id: 'chemistry', period: { month: 5, week: 2 },
  data: {
    lessons: [{ source: 'manual', sourceId: 'demo-ls-1', date: '', topic: '', combos: ['c_bh', 'c_fh'], present: 56, total: 61, liked: 46, avg: 0, disliked: 0, understanding: { u90: 45, u80: 1, u70: 0, u60: 0, u50: 0, u0: 0 } }],
    difficulties: [],
    mentor: { summary: 'Демо: ментор қорытындысы осы жерде көрсетіледі.', nextSteps: '- Демо: келесі қадам\n- Формула мысалы: H_2SO_4 + 2NaOH → Na_2SO_4 + 2H_2O' },
  },
});
await put({
  type: 'st', stream_id: 'sp2', subject_id: 'chemistry', period: { month: 3, week: 4 },
  data: { overallSource: 'manual', overall: { score: 18.4, max: 20 }, combos: [], hardTasks: [], mentor: {} },
});
await put({
  type: 'st', stream_id: 'sp2', subject_id: 'chemistry', period: { month: 4, week: 1 },
  data: {
    overallSource: 'manual', overall: { score: 16.2, max: 20 },
    combos: [{ comboId: 'c_bh', retakeCount: 25, retakePct: 42, note: '' }],
    hardTasks: [{ id: 'demo-t1', title: 'Демо мысал: формула мен ұзын мәтін', text: 'Демо: есептің толық мәтіні осылай көрсетіледі. 0,1 моль H_2SO_4 ерітіндісіне артық мөлшерде NaOH қосылды.\nТүзілген тұздың массасын табыңыз (M(Na_2SO_4) = 142 г/моль).', topic: 'Демо', explanation: 'Демо: ментордың түсіндірмесі.' }],
    mentor: { recommendation: 'Демо: келесі аптаға ұсыныс.' },
  },
});
await put({
  type: 'bt', stream_id: 'sp1', scope: 'all', period: { test_date: '2026-11-08', label: 'Демо БТ' },
  data: {
    participants: null, comparable: true, overall: { avg: null, max: null },
    top3: [{ name: 'Демо оқушы 1' }, { name: 'Демо оқушы 2' }, { name: 'Демо оқушы 3' }],
    subjects: [{ subjectId: 'chemistry', avg: null, max: null, top3: [{ name: 'Демо оқушы 1' }], hardTopics: ['Демо тақырып'], recommendation: 'Демо: пәндік ұсыныс.' }],
    hardTopics: ['Демо тақырып'], analysis: 'Демо: жалпы талдау.', actionPlan: 'Демо: әрекет жоспары.',
  },
});
await d.close();
