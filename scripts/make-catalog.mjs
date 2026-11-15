// Бір рет іске қосылатын көмекші: seed/catalog.json файлын промптта берілген кестеден жасайды.
// Аты-жөндер кестедегі күйінде сақталады. Кейінгі өзгерістер әкімші бөлімінде жасалады.
import fs from 'node:fs';

const subjects = [
  ['physics', 'Физика', 'Физ', 'F', 'F=ma v a t g λ Ω E Δt ∑F N J W ħ ν ρ'],
  ['toefl', 'TOEFL', 'TOEFL', 'Aa', 'A b C d e F g H i j K l M n o P q R s T u V w X y Z'],
  ['informatics', 'Информатика', 'Инф', '</>', '0 1 { } ; if for while == && || def int bit 0x <> []'],
  ['law', 'Құқық', 'Құқ', '§', '§ ¶ ст. ҚР бап заң № ⅰ ⅱ ⅲ'],
  ['kaz_lit', 'Қазақ әдебиеті', 'Қаз әдеб', 'Әд', 'Абай өлең жыр ақын роман « » — ! ?'],
  ['kaz_lang', 'Қазақ тілі', 'Қаз тілі', 'Ә', 'ә ғ қ ң ө ұ ү һ і Ә Ғ Қ Ң Ө Ұ Ү'],
  ['rus_lit', 'Орыс әдебиеті', 'Орыс әдеб', 'Лит', 'стих роман поэт « » — ! ? ё'],
  ['rus_lang', 'Орыс тілі', 'Орыс тілі', 'Ё', 'а б в г д е ё ж з и й к л м н о п р с т у ф х ц ч ш щ ъ ы ь э ю я'],
  ['math', 'Математика', 'Мат', '∑', '0 1 2 3 4 5 6 7 8 9 + − × ÷ = ≠ ≤ ≥ √ ∑ π ∞ ∫ x y f log sin cos % ² ³ Δ λ'],
  ['geometry', 'Геометрия', 'Геом', '△', '△ ∠ ⊥ ∥ ○ ° π R r S a b c h α β γ ≅ ∼ ⌒ ◇ □ sin cos tg 90° 60° 45° AB'],
  ['biology', 'Биология', 'Био', 'ДНҚ', 'ДНҚ РНҚ АТФ C₆H₁₂O₆ O₂ CO₂ 2n n XX XY Aa'],
  ['world_history', 'Дүниежүзі тарихы', 'Дүн. тарих', 'Ⅸ', 'Ⅰ Ⅱ Ⅲ Ⅳ Ⅴ Ⅵ Ⅶ Ⅷ Ⅸ Ⅹ Ⅺ Ⅻ ғ. б.з.д.'],
  ['geography', 'География', 'Геогр', 'N', 'N S E W ° ′ ″ км м³ ‰ ↑ ↓ ⇡'],
  ['chemistry', 'Химия', 'Хим', 'H₂O', 'H He Li C N O Na Cl Fe ⇌ → H₂O CO₂ pH mol H₂SO₄ NaCl e⁻'],
  ['math_lit', 'Математикалық сауаттылық', 'Мат сауат', '%', '% ‰ 1 2 3 4 5 6 7 8 9 0 + − × ÷ ='],
  ['kz_history', 'Қазақстан тарихы', 'ҚР тарихы', 'ҚТ', 'Ⅰ Ⅱ Ⅲ Ⅴ Ⅹ ғ. хан би жүз'],
];

// SapaLine-дағы пән slug-ы мен ресми түсі (sapaline.app пәндер анықтамалығынан). TOEFL логосы — SapaLine-дағы ағылшын тілінікі.
const BRAND = {
  math: ['math', '#1B36B0'], geometry: ['geometry', '#00998A'], physics: ['physics', '#863E98'], chemistry: ['chemistry', '#007EFF'],
  biology: ['biology', '#008240'], geography: ['geography', '#00427B'], informatics: ['informatics', '#17404E'], kz_history: ['tarih', '#AE2A00'],
  world_history: ['djt', '#F07436'], law: ['law', '#007069'], math_lit: ['ms', '#00A3B6'], kaz_lang: ['til', '#B64861'],
  kaz_lit: ['adebiet', '#BB8E52'], toefl: ['toefl', '#FF5678'], rus_lang: ['russian', '#5364AF'], rus_lit: ['literature', '#A16321'],
};

const streams = [['sp1', 'SMART PRO-1', 'SP-1'], ['sp2', 'SMART PRO-2', 'SP-2'], ['sp3', 'SMART PRO-3', 'SP-3']];

// Пән → [SMART PRO-1, SMART PRO-2, SMART PRO-3]
const table = {
  physics: ['Ізгілік Сланбек', 'Ізгілік Сланбек', 'Ізгілік Сланбек'],
  toefl: ['Амирбекова Ажар', 'Амирбекова Ажар', 'Амирбекова Ажар'],
  informatics: ['Нұрланов Эдуард', 'Нұрланов Эдуард', 'Нұрланов Эдуард'],
  law: ['Амангалиев Әділет', 'Амангалиев Әділет', 'Амангалиев Әділет'],
  kaz_lit: ['Жайлаубек Тоғжан', 'Жанболатұлы Батыл', 'Жайлаубек Тоғжан'],
  kaz_lang: ['Жалғас Айдана', 'Жалғас Айдана', 'Жалғас Айдана'],
  rus_lit: ['Шаукилова Құралай', 'Шаукилова Құралай', 'Шаукилова Құралай'],
  rus_lang: ['Муратбаева Жансая', 'Муратбаева Жансая', 'Муратбаева Жансая'],
  math: ['Құлахмет Нұрдәулет', 'Нұрдаулет Олжас', 'Бекет Ерсұлтан'],
  geometry: ['Құлахмет Нұрдәулет', 'Нұрдаулет Олжас', 'Бекет Ерсұлтан'],
  biology: ['Екпін Айбота', 'Рахмет Айтуған', 'Екпін Айбота'],
  world_history: ['Ізгілік Бекслан', 'Райхан Ардақ', 'Өзбек Бексұлтан'],
  geography: ['Өмірсеріков Бахтияр', 'Береке Ноян', 'Өмірсеріков Бахтияр'],
  chemistry: ['Сансызбаева Жанар', 'Қазбеков Дамир', 'Қазбеков Дамир'],
  math_lit: ['Муратов Дулат', 'Бағдатов Рахат', 'Муратов Дулат'],
  kz_history: ['Шора Абай', 'Әмірханов Әділет', 'Әбдіразақ Бердібек'],
};

const LAT = { а: 'a', ә: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', қ: 'q', л: 'l', м: 'm', н: 'n', ң: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ұ: 'u', ү: 'u', ф: 'f', х: 'h', һ: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', і: 'i', ь: '', э: 'e', ю: 'iu', я: 'ia' };
const slug = (s) => s.toLowerCase().split('').map((c) => (c in LAT ? LAT[c] : /[a-z0-9]/.test(c) ? c : '_')).join('').replace(/_+/g, '_').replace(/^_|_$/g, '');

// Фото тек аты-жөні lskb дерегімен дәл сәйкес келгенде ғана қойылады.
const PHOTOS = { 'Құлахмет Нұрдәулет': '/photos/t_kulakhmet.jpg', 'Бекет Ерсұлтан': '/photos/t_beket.jpg' };

const teachers = [];
const byName = new Map();
const assignments = [];
for (const [sid] of subjects) {
  table[sid].forEach((name, i) => {
    if (!byName.has(name)) {
      const t = { id: 't_' + slug(name), full_name: name, display: name, aliases: [], photo: PHOTOS[name] || null };
      if (teachers.some((x) => x.id === t.id)) throw new Error('teacher id collision: ' + t.id);
      teachers.push(t);
      byName.set(name, t);
    }
    assignments.push({ id: `a_${streams[i][0]}_${sid}`, teacher_id: byName.get(name).id, stream_id: streams[i][0], subject_id: sid, valid_from: null, valid_to: null, note: 'Бастапқы тізім' });
  });
}

const catalog = {
  note: 'Бастапқы анықтамалық. Дерекқор бос болғанда бір рет жүктеледі; кейін әкімші бөлімінде өзгертіледі.',
  subjects: subjects.map(([id, name, short, glyph, glyphs], i) => ({ id, name, short, glyph, glyphs, sort: i + 1, sapaline_code: BRAND[id][0], logo: BRAND[id][0], color: BRAND[id][1] })),
  streams: streams.map(([id, name, short], i) => ({ id, name, short, sort: i + 1 })),
  combinations: [
    { id: 'c_bh', code: 'БХ', name: 'Биология – Химия', sort: 1 },
    { id: 'c_fh', code: 'ФХ', name: 'Физика – Химия', sort: 2 },
  ],
  teachers,
  assignments,
};
fs.writeFileSync(new URL('../seed/catalog.json', import.meta.url), JSON.stringify(catalog, null, 2) + '\n');
console.log(`${catalog.subjects.length} пән, ${teachers.length} мұғалім, ${assignments.length} тағайындау`);
