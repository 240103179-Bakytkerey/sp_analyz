// src/ ішінен public/index.html жасайды (Vercel әр деплойда іске қосады — vercel.json).
// lskb/scripts/build.mjs құрылымымен: бір HTML, ішінде CSS пен JS. lib/calc.js браузерге де
// енгізіледі — сервер мен бет бірдей есептеу ережесін қолданады.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function emblem(file) {
  const svg = rd(file);
  return { vb: svg.match(/viewBox="([^"]+)"/)[1], d: svg.match(/ d="([^"]+)"/)[1] };
}
const EMBLEM = { geometry: emblem('src/emblems/geometry.svg'), math: emblem('src/emblems/math.svg'), juz40: emblem('src/emblems/juz40.svg') };

// SapaLine пән логолары (src/logos/*.svg): түсті фон алынып, ақ таңба currentColor-ға айналады —
// бет оны пәннің өз түсіндегі плиткаға салады. id-лер қайталанбауы үшін префикс қосылады.
const LOGOS = {};
for (const f of fs.readdirSync(path.join(ROOT, 'src/logos'))) {
  if (!f.endsWith('.svg')) continue;
  const key = f.slice(0, -4), svg = rd('src/logos/' + f);
  const vb = svg.match(/viewBox="([^"]+)"/)[1];
  const bg = (svg.match(/<rect[^>]*fill="(#[0-9A-Fa-f]{3,8})"/) || [])[1];
  let inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
    .replace(/<rect[^>]*fill="#[0-9A-Fa-f]{3,8}"[^>]*\/>/, '')
    .replace(/(fill|stroke)="(white|#fff|#ffffff|#FFE0BF|#010101)"/gi, '$1="currentColor"')
    .replace(/id="([^"]+)"/g, `id="lg-${key}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#lg-${key}-$1)`)
    .replace(/\s*\n\s*/g, '');
  if (bg) inner = inner.replace(new RegExp(`fill="${bg}"`, 'gi'), 'fill="none"');
  // SMART PRO белгісінің сызбасы ортадан ~9,6 бірлік солға ығысқан (өлшенді) — плитка ортасына түзетіледі.
  if (key === 'smart_pro') inner = `<g transform="translate(9.6 0)">${inner}</g>`;
  LOGOS[key] = { vb, inner, color: bg || null };
}

// calc.js: export сөздері алынып, беттің ішкі функцияларына айналады
const CALC = rd('lib/calc.js').replace(/^export (function|const) /gm, '$1 ');
if (/^\s*(import|export)\b/m.test(CALC)) throw new Error('calc.js must not import/export anything else');
const consts = 'var EMBLEM = ' + JSON.stringify(EMBLEM) + ';\nvar LOGOS = ' + JSON.stringify(LOGOS) + ';';
const APP = '(function () {\n\'use strict\';\n' + consts + '\n' + CALC + '\n' + rd('src/app.js') + '\n' + rd('src/admin.js') + '\n})();';
new Function(APP); // syntax check
const CSS = rd('src/styles.css');
const SHELL = rd('src/shell.html').trim();
if (/<\/script/i.test(APP)) throw new Error('app must not contain </script');
if (/<\/style/i.test(CSS)) throw new Error('styles.css must not contain </style');

const FONTS = [[400, 'Regular'], [500, 'Medium'], [700, 'Bold']]
  .map(([w, n]) => `@font-face{font-family:"JUZ40";src:url(/fonts/JUZ40-${n}.woff2) format("woff2");font-weight:${w};font-style:normal;font-display:swap}`)
  .join('');
const RESET = ':root{box-sizing:border-box}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}';

const html = `<!doctype html>
<html lang="kk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>JUZ40 SMART PRO · Анализ</title>
<meta name="description" content="JUZ40 · SMART PRO мұғалімдеріне ЛС, СТ және БТ бойынша кері байланыс">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#1b36b0">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/JUZ40-Bold.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Noto+Sans+Math&display=swap">
<style>${RESET}</style>
<style>${FONTS}</style>
<style>${CSS}</style>
</head>
<body>
${SHELL}
<script>
${APP}
</script>
</body>
</html>
`;
fs.mkdirSync(path.join(ROOT, 'public'), { recursive: true });
// KaTeX (платформа есептеріндегі LaTeX формулалар үшін) сайттың өзінен беріледі — сыртқы CDN керек емес.
const KATEX = path.join(ROOT, 'node_modules', 'katex', 'dist');
if (fs.existsSync(KATEX)) {
  const out = path.join(ROOT, 'public', 'katex');
  fs.mkdirSync(path.join(out, 'contrib'), { recursive: true });
  for (const f of ['katex.min.js', 'katex.min.css', 'contrib/auto-render.min.js']) fs.copyFileSync(path.join(KATEX, f), path.join(out, f));
  fs.cpSync(path.join(KATEX, 'fonts'), path.join(out, 'fonts'), { recursive: true, filter: (src) => !/\.(ttf|woff)$/.test(src) });
} else console.warn('KaTeX табылмады (npm install орындаңыз): LaTeX формулалар мәтін болып көрінеді');
fs.writeFileSync(path.join(ROOT, 'public', 'index.html'), html);
console.log(`public/index.html — ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
