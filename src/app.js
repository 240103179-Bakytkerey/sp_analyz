/* SMART PRO кері байланыс беті. Қаңқасы мен көрнекі тілі keribailanys (lskb/src/app.js) бетінен:
   қою көк кіріспе, мұғалімдер тізімі, әр мұғалімге бір толық бөлім (ірі фото, ірі сандар), қорытынды мен
   қорытынды. Кеңейтілгені: ЛС / СТ / БТ, үш ағым, 16 пән (іздеуі бар топталған таңдау), комбинациялар,
   динамика, тікелей сілтеме. Есептеу ережелері lib/calc.js-тен (жоғарыда енгізілген). */

/* ================= helpers ================= */
var $ = function (s, el) { return (el || document).querySelector(s); };
var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function fmtInt(n) { return isNum(n) ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '—'; }
function pad2(i) { return String(i + 1).padStart(2, '0'); }
var reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
// Браузер қоймасы тек интерфейс таңдауларына (соңғы түр/ағым) қолданылады; негізгі дерек — серверде.
var store = {
  get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};
function copyText(text) {
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
    document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    return ok ? Promise.resolve() : Promise.reject(new Error('copy'));
  }
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(fallback);
  return fallback();
}
function api(method, url, body) {
  return fetch(url, { method: method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
    .then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.message || ('Қате ' + r.status)); e.status = r.status; e.body = j; throw e; }
        return j;
      });
    }, function () { var e = new Error('Серверге қосылу мүмкін болмады. Интернетті тексеріңіз.'); e.status = 0; throw e; });
}
var toastT = 0;
function toast(msg, tone) {
  var t = $('#toast');
  t.textContent = msg; t.hidden = false;
  if (tone) t.setAttribute('data-tone', tone); else t.removeAttribute('data-tone');
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, tone === 'bad' ? 6000 : 3200);
}

/* Мәтін: абзац, «- » тармақ, «1. » нөмірлі тармақ, **қалың**, H_2O / x^2 / _{..} ^{..} (химия, математика). */
// Платформа мәтініндегі LaTeX бөліктері ($$…$$, $…$, \(…\), \[…\]) өзгертілмей қалады — оларды KaTeX сызады.
var MATH_RE = /(\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\$[^$\n]{1,300}?\$)/;
function inline(s) {
  return String(s == null ? '' : s).split(MATH_RE).map(function (part, i) { return i % 2 ? esc(part) : inlinePlain(part); }).join('');
}
/** Формуласыз мәтіндегі химиялық индекстер: NO3 → NO₃, (NO3)2 → (NO₃)₂ (Cr3+ сияқты зарядқа тиіспейді). */
function chemSub(html) {
  return html.replace(/([A-Z][a-z]?|\))(\d{1,2})(?![\d,.%°+\-−⁺⁻\/])/g, '$1<sub>$2</sub>');
}
function inlinePlain(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/_\{([^}]{1,24})\}/g, '<sub>$1</sub>')
    .replace(/\^\{([^}]{1,24})\}/g, '<sup>$1</sup>')
    .replace(/([A-Za-zА-Яа-я\)\]])_(\d{1,3})/g, '$1<sub>$2</sub>')
    .replace(/\^([0-9+\-−]{1,4})/g, '<sup>$1</sup>');
}
function richText(s, cls) {
  var lines = String(s || '').split('\n'), html = '', list = null;
  function close() { if (list) { html += '</' + list + '>'; list = null; } }
  lines.forEach(function (raw) {
    var l = raw.replace(/\s+$/, '');
    var b = /^\s*[-•→*]\s+(.*)$/.exec(l), n = /^\s*\d+[.)]\s+(.*)$/.exec(l);
    if (b) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += '<li>' + inline(b[1]) + '</li>'; }
    else if (n) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += '<li>' + inline(n[1]) + '</li>'; }
    else if (!l.trim()) close();
    else { close(); html += '<p>' + inline(l) + '</p>'; }
  });
  close();
  return html ? '<div class="rich' + (cls ? ' ' + cls : '') + '">' + html + '</div>' : '';
}

/* KaTeX: платформа есептеріндегі LaTeX формулалар. Кітапхана тек қажет болғанда жүктеледі. */
var katexState = null;
function loadKatex() {
  if (katexState) return katexState;
  var base = '/katex/';
  function js(src) { return new Promise(function (ok, bad) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); }); }
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = base + 'katex.min.css'; document.head.appendChild(css);
  katexState = js(base + 'katex.min.js').then(function () { return js(base + 'contrib/auto-render.min.js'); }).catch(function () { katexState = null; });
  return katexState;
}
function typesetMath(rootEl) {
  if (!rootEl) return;
  var targets = $$('.task, .aPreview, .rich', rootEl).filter(function (el) { return /\$|\\\(|\\\[/.test(el.textContent); });
  if (!targets.length) return;
  loadKatex() && loadKatex().then(function () {
    if (!window.renderMathInElement) return;
    targets.forEach(function (el) {
      try {
        window.renderMathInElement(el, { delimiters: [{ left: '$$', right: '$$', display: false }, { left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }, { left: '$', right: '$', display: false }], throwOnError: false, strict: 'ignore', ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option', 'input'] });
      } catch (e) {}
    });
    layout(); update();
  });
}

/* ================= brand ================= */
function logoSVG(cls, w, h) {
  var E = EMBLEM.juz40;
  return '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="' + E.vb + '"' + (w ? ' width="' + w + '" height="' + h + '"' : '') + ' fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="' + E.d + '"/></svg>';
}
var LOGO = logoSVG('', 71, 22);
function glyphSize(g) { var n = String(g).length; return n <= 1 ? 86 : n === 2 ? 62 : n === 3 ? 46 : 34; }
/** Пән белгісі: математика/геометрия — lskb эмблемасы, басқасы — пәннің таңбасы (H₂O, §, Ә …). */
function emblemSVG(glyphOrId, cls) {
  var E = EMBLEM[glyphOrId];
  if (E) return '<svg class="' + (cls || '') + '" viewBox="' + E.vb + '" aria-hidden="true"><path d="' + E.d + '"/></svg>';
  var g = String(glyphOrId || '·');
  return '<svg class="' + (cls || '') + ' glyphSvg" viewBox="0 0 120 120" aria-hidden="true"><text x="60" y="64" text-anchor="middle" dominant-baseline="middle" font-family="JUZ40, Noto Sans Math, sans-serif" font-weight="700" font-size="' + glyphSize(g) + '" letter-spacing="-2">' + esc(g) + '</text></svg>';
}
function subjEmblem(s, cls) { var L = s && s.logo && LOGOS[s.logo]; if (L) return '<svg class="' + (cls || '') + '" viewBox="' + L.vb + '" fill="none" aria-hidden="true">' + L.inner + '</svg>'; return emblemSVG(s && EMBLEM[s.id] ? s.id : s ? s.glyph : '·', cls); }
function heroEmblem(key, glyph) {
  var E = EMBLEM[key];
  var grad = '<defs><linearGradient id="zg-h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--z1)"/><stop offset=".48" style="stop-color:var(--z2)"/><stop offset="1" style="stop-color:var(--z3)"/></linearGradient></defs>';
  if (E) {
    return '<svg viewBox="' + E.vb + '" aria-hidden="true">' + grad + '<g class="zghost"><path transform="translate(30 26)" d="' + E.d + '"/></g>' +
      '<g class="zmain"><path class="zdepth" transform="translate(-10 12)" d="' + E.d + '"/><path fill="url(#zg-h)" d="' + E.d + '"/></g></svg>';
  }
  var t = function (cls, extra) { return '<text ' + (cls ? 'class="' + cls + '" ' : '') + 'x="60" y="64" text-anchor="middle" dominant-baseline="middle" font-family="JUZ40, Noto Sans Math, sans-serif" font-weight="700" font-size="' + glyphSize(glyph) + '" letter-spacing="-3"' + (extra || '') + '>' + esc(glyph) + '</text>'; };
  return '<svg viewBox="0 0 120 120" aria-hidden="true">' + grad + '<g class="zghost"><g transform="translate(6 5)">' + t('', '') + '</g></g>' +
    '<g class="zmain"><g transform="translate(-2 2.5)">' + t('zdepthT') + '</g>' + t('', ' fill="url(#zg-h)"') + '</g></svg>';
}
function initials(name) {
  var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join('') || '?';
}

/* ================= пән түстері (SapaLine палитрасы) =================
   Әр пәннің ресми түсінен (subjects.color) панель палитрасы жасалады: қою панель — сол түс
   (ақ мәтін оқылатындай жеткілікті қою етіп), ашық панель — түстің мұздай реңі. Математика мен
   геометрия палитрасы keribailanys-тағыдай қолмен бапталған (styles.css). «Барлық пәндер» —
   SMART PRO бөлімінің қара-алтын түсі. */
function hexRgb(h) { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16); return isNaN(n) ? [27, 54, 176] : [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbHex(c) { return '#' + c.map(function (v) { return ('0' + Math.round(clamp(v, 0, 255)).toString(16)).slice(-2); }).join(''); }
function mixC(a, b, t) { return [0, 1, 2].map(function (i) { return a[i] + (b[i] - a[i]) * t; }); }
function lumC(c) { var v = c.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }
function contrastC(a, b) { var x = lumC(a), y = lumC(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
var WHITE = [255, 255, 255], BLACK = [0, 0, 0];
function paletteVars(hex) {
  var c = hexRgb(hex), dbg = c, i = 0;
  while (contrastC(WHITE, dbg) < 5.2 && i++ < 30) dbg = mixC(dbg, BLACK, 0.07);
  var lbg = mixC(c, WHITE, 0.82), lfg = dbg; i = 0;
  while (contrastC(lfg, lbg) < 6.5 && i++ < 30) lfg = mixC(lfg, BLACK, 0.08);
  var glow = mixC(c, WHITE, 0.42), shadow = mixC(dbg, BLACK, 0.68), deep = mixC(dbg, BLACK, 0.52);
  var v = {
    'd-bg': dbg, 'd-fg': mixC(c, WHITE, 0.87), 'd-acc': mixC(c, WHITE, 0.6), 'd-acctext': mixC(c, WHITE, 0.6), 'd-chip': dbg,
    'l-bg': lbg, 'l-fg': lfg, 'l-acc': lfg, 'l-chip': lbg, glow: glow, shadow: shadow, frost: mixC(c, WHITE, 0.95),
    z1: mixC(c, WHITE, 0.96), z2: lbg, z3: mixC(c, WHITE, 0.45), zdepth: mixC(c, WHITE, 0.2), 'a-fg': mixC(c, WHITE, 0.9), 'a-acc': mixC(c, WHITE, 0.6), 'a-ink': deep, deep: deep, tile: c
  };
  var out = '';
  Object.keys(v).forEach(function (k) { out += '--' + k + ':' + rgbHex(v[k]) + ';'; });
  return out + '--amb-d:color-mix(in oklab,' + rgbHex(glow) + ' 18%,transparent);--amb-l:color-mix(in oklab,' + rgbHex(glow) + ' 62%,transparent);--veil:color-mix(in oklab,' + rgbHex(shadow) + ' 30%,transparent);';
}
var SP_GOLD = '#C2A36D';
function injectPalettes() {
  var css = '[data-subj="all"]{--d-bg:#15171d;--d-fg:#f4ead8;--d-acc:#d9bf8f;--d-acctext:#d9bf8f;--d-chip:#15171d;--l-bg:#f2eadc;--l-fg:#3b2f18;--l-acc:#3b2f18;--l-chip:#f2eadc;' +
    '--glow:#c2a36d;--amb-d:color-mix(in oklab,#c2a36d 16%,transparent);--amb-l:color-mix(in oklab,#d9bf8f 55%,transparent);--veil:#0000;--shadow:#07080b;--frost:#fbf6ec;--z1:#fff8ea;--z2:#e9d6b0;--z3:#c2a36d;--zdepth:#7a6236;' +
    '--a-fg:#f4ead8;--a-acc:#d9bf8f;--a-ink:#0d0e12;--deep:#0d0e12;--tile:#c2a36d}';
  cat().subjects.forEach(function (s) {
    if (!s.color || s.id === 'math' || s.id === 'geometry') return;
    css += '[data-subj="' + s.id.replace(/[^a-z0-9_-]/gi, '') + '"]{' + paletteVars(s.color) + '}';
  });
  var el = $('#subjPal');
  if (!el) { el = document.createElement('style'); el.id = 'subjPal'; document.head.appendChild(el); }
  el.textContent = css;
}
function logoOf(s) { return s && s.logo && LOGOS[s.logo] ? LOGOS[s.logo] : null; }
function logoSVGOf(L, cls) { return '<svg class="' + (cls || '') + '" viewBox="' + L.vb + '" fill="none" aria-hidden="true">' + L.inner + '</svg>'; }
/** SapaLine-дағыдай пән плиткасы: пәннің түсі + ақ таңба. */
function subjTile(s, cls) {
  var L = logoOf(s);
  return '<span class="tile ' + (cls || '') + '" style="--tile:' + esc((s && s.color) || '#1b36b0') + '">' + (L ? logoSVGOf(L) : '<b>' + esc((s && s.glyph) || '·') + '</b>') + '</span>';
}
function spTile(cls) { return '<span class="tile ' + (cls || '') + '" style="--tile:' + SP_GOLD + '">' + logoSVGOf(LOGOS.smart_pro) + '</span>'; }
/** Басты экран: пән таңдалса — сол пәннің ірі плиткасы; әйтпесе — SMART PRO айналасында 16 пәннің орбитасы. */
function heroArt() {
  var s = subjOf(F.subject);
  if (s) {
    return '<div class="zmark tileMark" aria-hidden="true"><div class="zglow"></div><div class="heroTile ghost" style="--tile:' + esc(s.color || '#1b36b0') + '"></div>' + subjTile(s, 'heroTile') + '</div>';
  }
  var subs = cat().subjects.filter(function (x) { return x.active !== false; });
  // Кірмеген адамға анықтамалық берілмейді: онда SapaLine логоларының өзі көрсетіледі.
  if (!subs.length) subs = Object.keys(LOGOS).filter(function (k) { return k !== 'smart_pro'; }).map(function (k) { return { logo: k, color: LOGOS[k].color }; });
  return '<div class="orbitWrap" aria-hidden="true"><div class="orbitGlow"></div><div class="orbit" style="--n:' + subs.length + '"><div class="orbitPlane"><div class="orbitLine"></div><div class="orbitLine two"></div>' +
    subs.map(function (x, i) { return '<span class="oSlot" style="--i:' + i + '">' + subjTile(x, 'oTile') + '</span>'; }).join('') +
    '</div></div><div class="orbitCore">' + spTile('coreTile') + '</div></div>';
}

var TYPES = {
  ls: { short: 'ЛС', name: 'LIVE сабақ', hero: 'ЛС анализі', eyebrow: 'LIVE сабақ', lede: 'Оқушылардың сабаққа берген бағасы — келесі сабақты күшейтудің ең маңызды жолы.' },
  st: { short: 'СТ', name: 'Сабақ тапсыру', hero: 'СТ анализі', eyebrow: 'Сабақ тапсыру', lede: 'Оқушы қай тапсырмада қиналғанын білу — алдағы әрекетті дұрыс жоспарлаудың негізі.' },
  bt: { short: 'БТ', name: 'Байқау тесті', hero: 'БТ анализі', eyebrow: 'Байқау тесті', lede: 'Байқау тесті — оқушылардың нақты деңгейін көрсететін айна.' }
};
// Пән таңдау панеліндегі топтар (тек интерфейс үшін; жаңа пән «Басқа» тобына түседі).
var SUBJ_GROUPS = [
  { name: 'Есеп', ids: ['math', 'geometry', 'math_lit', 'informatics', 'physics', 'chemistry'] },
  { name: 'Ауызша', ids: ['biology', 'geography', 'kz_history', 'world_history', 'law', 'kaz_lit', 'rus_lit'] },
  { name: 'Жазбаша', ids: ['kaz_lang', 'rus_lang', 'toefl'] }
];

/* ================= state ================= */
var root = $('#root');
var S = { session: null, user: null, catalog: null, view: null, loading: false, drafts: false, isAdminPath: /^\/admin\/?$/.test(location.pathname) };
var F = { type: 'ls', stream: 'all', subject: 'all', period: null, combo: 'all' };
function readURL() {
  var u = new URLSearchParams(location.search);
  F.type = TYPES[u.get('t')] ? u.get('t') : (TYPES[store.get('sp.type')] ? store.get('sp.type') : 'ls');
  F.stream = u.get('s') || store.get('sp.stream') || 'all';
  F.subject = u.get('subj') || 'all';
  F.period = u.get('p') || null;
  F.combo = u.get('c') || 'all';
  S.drafts = u.get('drafts') === '1';
}
function urlFor(extraHash) {
  var u = new URLSearchParams();
  u.set('t', F.type);
  if (F.stream !== 'all') u.set('s', F.stream);
  if (F.subject !== 'all') u.set('subj', F.subject);
  if (F.period) u.set('p', F.period);
  if (F.combo !== 'all') u.set('c', F.combo);
  if (S.drafts) u.set('drafts', '1');
  return (S.isAdminPath ? '/admin' : '/') + '?' + u.toString() + (extraHash || '');
}
function writeURL(hash) {
  try { history.replaceState(null, '', urlFor(hash == null ? location.hash : hash)); } catch (e) {}
  store.set('sp.type', F.type); store.set('sp.stream', F.stream);
}
function cat() { return S.catalog || { subjects: [], streams: [], combinations: [], teachers: [] }; }
function findBy(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
function subjOf(id) { return findBy(cat().subjects, id); }
function comboOf(id) { return findBy(cat().combinations, id); }
function streamOf(id) { return findBy(cat().streams, id); }
function canEdit() { return S.user && (S.user.role === 'admin' || S.user.role === 'mentor'); }

/* ================= header ================= */
function renderHeader() {
  $('#logoSlot').innerHTML = LOGO;
  var showNav = !!(S.user || (S.session && S.session.publicView));
  ['#typeNav', '#streamNav', '.subjWrap', '#weeks'].forEach(function (sel) { $(sel).hidden = !showNav; });
  if (showNav) root.removeAttribute('data-anon'); else root.setAttribute('data-anon', '');
  $('#typeNav').innerHTML = Object.keys(TYPES).map(function (k) {
    return '<button class="segBtn" type="button" data-type="' + k + '" aria-pressed="' + (k === F.type) + '" title="' + esc(TYPES[k].name) + '">' + TYPES[k].short + '</button>';
  }).join('');
  $('#streamNav').innerHTML = '<button class="segBtn" type="button" data-stream="all" aria-pressed="' + (F.stream === 'all') + '">Барлығы</button>' +
    cat().streams.filter(function (s) { return s.active !== false; }).map(function (s) {
      return '<button class="segBtn" type="button" data-stream="' + esc(s.id) + '" aria-pressed="' + (F.stream === s.id) + '" title="' + esc(s.name) + '">' + esc(s.short) + '</button>';
    }).join('');
  var s = subjOf(F.subject);
  var pick = $('#subjPick');
  pick.innerHTML = (s ? subjTile(s, 'pickEm') : spTile('pickEm')) + '<span class="pickName">' + esc(s ? s.name : F.type === 'bt' ? 'Барлық пәндер' : 'Барлық пәндер') + '</span><span class="pickCaret" aria-hidden="true">▾</span>';
  pick.setAttribute('aria-label', 'Пән: ' + (s ? s.name : 'барлық пәндер') + '. Өзгерту');
  var ps = (S.view && S.view.periods) || [];
  var box = $('#weeks');
  box.innerHTML = (ps.length ? '<span class="weeksLabel">' + (F.type === 'bt' ? 'Тест' : 'Апта') + '</span>' : '') + ps.map(function (p) {
    return '<button class="weekBtn" type="button" data-period="' + esc(p.key) + '" aria-pressed="' + (S.view && p.key === S.view.period) + '"' + (p.drafts && S.drafts ? ' data-draft' : '') + '>' + esc(p.label) + '</button>';
  }).join('');
  var on = $('.weekBtn[aria-pressed="true"]', box);
  if (on) box.scrollLeft = Math.max(0, on.offsetLeft - box.clientWidth + on.offsetWidth + 8);
  var ub = $('#userBtn');
  if (S.user) {
    ub.innerHTML = KEY_ICON + '<span>' + esc(canEdit() ? (S.user.role === 'admin' ? 'Әкімші' : 'Ментор') : S.user.displayName.split(' ')[0]) + '</span>';
    ub.title = S.user.displayName + ' · ' + ROLE_NAME[S.user.role];
  } else {
    ub.innerHTML = KEY_ICON + '<span>Кіру</span>';
    ub.title = 'Жүйеге кіру';
  }
  if (window.__adminDirty && window.__adminDirty()) ub.setAttribute('data-dirty', ''); else ub.removeAttribute('data-dirty');
}
var KEY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 1a4.5 4.5 0 0 0-4.27 5.92L1 12.15V15h2.85l.65-.65V13h1.35l.65-.65V11h1.35l1.23-1.23A4.5 4.5 0 1 0 10.5 1Zm1.25 4.75a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/></svg>';
var ROLE_NAME = { admin: 'әкімші', mentor: 'ментор', viewer: 'көруші' };

/* ---------- subject picker: search + grouped panel (sheet on phones) ---------- */
function openPicker() {
  var p = $('#picker');
  var subs = cat().subjects.filter(function (s) { return s.active !== false; });
  var used = {};
  var groups = SUBJ_GROUPS.map(function (g) {
    var items = g.ids.map(function (id) { return findBy(subs, id); }).filter(Boolean);
    items.forEach(function (s) { used[s.id] = 1; });
    return { name: g.name, items: items };
  });
  var rest = subs.filter(function (s) { return !used[s.id]; });
  if (rest.length) groups.push({ name: 'Басқа', items: rest });
  // Пәнде осы сүзгіге дерек бар ма — көрсету үшін (бос пәндер де таңдалады, бірақ сұр).
  p.innerHTML = '<div class="pickBox" role="dialog" aria-modal="true" aria-label="Пәнді таңдау">' +
    '<div class="pickHead"><input class="pickSearch" id="pickSearch" type="search" placeholder="Пәнді іздеу…" autocomplete="off" aria-label="Пәнді іздеу"><button class="pickClose" type="button" data-close aria-label="Жабу">✕</button></div>' +
    '<div class="pickBody" id="pickBody">' +
    '<button class="pickItem all" type="button" data-subj="all" aria-pressed="' + (F.subject === 'all') + '">' + spTile('pickEm') + '<span><b>Барлық пәндер</b><small>Ағымның барлық мұғалімі бір тізімде</small></span></button>' +
    groups.map(function (g) {
      return '<div class="pickGroup"><p class="pickGroupName">' + esc(g.name) + '</p><div class="pickGrid">' + g.items.map(function (s) {
        return '<button class="pickItem" type="button" data-subj="' + esc(s.id) + '" data-q="' + esc((s.name + ' ' + s.short).toLowerCase()) + '" aria-pressed="' + (F.subject === s.id) + '">' + subjTile(s, 'pickEm') + '<span><b>' + esc(s.name) + '</b></span></button>';
      }).join('') + '</div></div>';
    }).join('') + '<p class="pickNone" id="pickNone" hidden>Пән табылмады</p></div></div>';
  p.hidden = false;
  $('#subjPick').setAttribute('aria-expanded', 'true');
  document.documentElement.classList.add('pickOn');
  setTimeout(function () { var i = $('#pickSearch'); if (i && !smallMQ.matches) i.focus(); }, 30);
}
function closePicker() {
  var p = $('#picker'); if (p.hidden) return;
  p.hidden = true; p.innerHTML = '';
  $('#subjPick').setAttribute('aria-expanded', 'false');
  document.documentElement.classList.remove('pickOn');
}
function filterPicker(q) {
  q = String(q || '').trim().toLowerCase();
  var any = false;
  $$('#pickBody .pickItem[data-q]').forEach(function (b) { var ok = !q || b.getAttribute('data-q').indexOf(q) >= 0; b.hidden = !ok; if (ok) any = true; });
  $$('#pickBody .pickGroup').forEach(function (g) { g.hidden = !$$('.pickItem:not([hidden])', g).length; });
  var all = $('#pickBody .pickItem.all'); if (all) all.hidden = !!q;
  $('#pickNone').hidden = any || !q;
}

/* ================= dynamics chip ================= */
var NA_TEXT = {
  no_prev_period: 'Алдыңғы апта күнтізбеде жоқ',
  no_prev_data: 'Алдыңғы апта дерегі жоқ',
  no_prev_combo: 'Алдыңғы аптада бұл комбинация дерегі жоқ',
  no_previous: 'Алдыңғы кезеңде бұл көрсеткіш жоқ',
  no_prev_bt: 'Салыстыруға жарамды алдыңғы БТ жоқ',
  no_prev_subject: 'Алдыңғы БТ-да бұл пән жоқ',
  not_comparable: 'Бұл БТ салыстыруға жарамсыз деп белгіленген',
  max_unknown: 'Максимал балл белгісіз — салыстыру мүмкін емес'
};
function dynChip(dyn, d, opts) {
  opts = opts || {};
  if (!dyn) return '';
  var since = dyn.prevPeriod ? dyn.prevPeriod.label : '';
  if (dyn.status !== 'ok') {
    var t = NA_TEXT[dyn.status] || '';
    return t ? '<span class="dyn" data-state="na"><i aria-hidden="true">·</i><span>' + esc(t) + (since && dyn.status === 'no_prev_data' ? ' <small>(' + esc(since) + ')</small>' : '') + '</span></span>' : '';
  }
  if (!d || d.state === 'na') {
    if (d && d.reason === 'no_current') return '';
    return '<span class="dyn" data-state="na"><i aria-hidden="true">·</i><span>' + esc(NA_TEXT[(d && d.reason) || 'no_previous'] || 'Салыстыру жоқ') + (since ? ' <small>(' + esc(since) + ')</small>' : '') + '</span></span>';
  }
  var sym = d.state === 'up' ? '▲' : d.state === 'down' ? '▼' : '=';
  var word = d.state === 'same' ? 'Өзгеріссіз' : d.good ? 'Прогресс' : 'Регресс';
  var note = d.normalized ? ' · максимал балл өзгерді (' + fmtNum(d.prevMax) + ' → ' + fmtNum(d.curMax) + '), максимумнан үлесі салыстырылды' : d.maxUnknown ? ' · бір кезеңнің максимал балы белгісіз' : '';
  return '<span class="dyn" data-state="' + d.state + '" data-good="' + (d.state === 'same' ? '' : d.good ? '1' : '0') + '"' + (opts.big ? ' data-big' : '') + '>' +
    '<i aria-hidden="true">' + sym + '</i><b>' + esc(fmtDelta(d)) + '</b><span class="dynWord">' + word + '</span>' +
    '<small>' + esc(since) + ' аптасымен' + esc(note) + '</small></span>';
}
function flagsHTML(dyn) {
  if (!dyn || !dyn.flags || !dyn.flags.length) return '';
  return '<ul class="flags">' + dyn.flags.map(function (f) {
    if (f.code === 'teacher_changed') return '<li>Алдыңғы кезеңде мұғалім басқа болған' + (f.prevTeacher ? ' (' + esc(f.prevTeacher.name) + ')' : '') + ' — айырманы мұғалім жұмысының әсері деп түсіндіруге болмайды.</li>';
    if (f.code === 'composition_changed') return '<li>Комбинациялар құрамы алдыңғы аптадан өзгеше — салыстыру шартты.</li>';
    if (f.code === 'cohort_changed') return '<li>Когорта өзгерген (' + esc(f.prev || '—') + ' → ' + esc(f.cur || '—') + ') — салыстыру шартты.</li>';
    return '';
  }).join('') + '</ul>';
}

/* ================= acts: intro / login / empty ================= */
function heroKey() { var s = subjOf(F.subject); return s && EMBLEM[s.id] ? s.id : null; }
function heroGlyph() { var s = subjOf(F.subject); return s ? s.glyph : TYPES[F.type].short; }
function introHTML(stats, hasList) {
  var T = TYPES[F.type], s = subjOf(F.subject), st = streamOf(F.stream);
  var eyebrow = 'JUZ40 · SMART PRO · ' + T.eyebrow;
  var cue = hasList
    ? '<button class="cue cueBtn" type="button" data-go="roster"><span class="cueText">' + (F.type === 'bt' ? 'Нәтижелер' : 'Мұғалімдер тізімі') + '</span><span class="cueArrow" aria-hidden="true">↓</span></button>'
    : '<div class="cue"><span class="cueLine"></span><span class="cueText">Төменге жылжыт</span></div>';
  var ctx = [st ? st.name : 'Барлық ағымдар', s ? s.name : 'Барлық пәндер'];
  if (stats && stats.period) ctx.push(stats.period);
  return '<section class="act intro" data-theme="dark" id="top"><div class="pin"><div class="ambient"></div><div class="introRing"></div>' +
    heroArt() +
    '<div class="flow"><p class="eyebrow">' + esc(eyebrow) + '</p><h1 class="hero">' + esc(T.hero) + '</h1>' +
    '<p class="lede">' + esc(T.lede) + '</p>' +
    '<p class="introCtx">' + ctx.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</p>' +
    (S.drafts ? '<p class="introNote">Алдын ала қарау: жобалар да көрсетілген. Мұғалімдер тек жарияланғанын көреді.</p>' : '') + cue + '</div></div></section>';
}
function loginHTML(msg) {
  return '<section class="act intro" data-theme="dark" id="top"><div class="pin"><div class="ambient"></div><div class="introRing"></div>' +
    heroArt() +
    '<div class="flow"><p class="eyebrow">JUZ40 · SMART PRO</p><h1 class="hero">Анализ</h1>' +
    '<p class="lede">Әр аптаның нақты саны мен нақты ұсынысы — прогресске апаратын жол.</p>' +
    '<form class="loginForm" id="loginForm" autocomplete="on"><label class="aField"><span>Логин</span><input class="aIn" name="username" autocomplete="username" required></label>' +
    '<label class="aField"><span>Құпиясөз</span><input class="aIn" name="password" type="password" autocomplete="current-password" required></label>' +
    '<button class="ackBtn" type="submit">Кіру</button><p class="loginErr" id="loginErr" role="alert">' + esc(msg || '') + '</p></form>' +
    '</div></div></section>';
}
function emptyHTML(hasAny) {
  var T = TYPES[F.type];
  var title = hasAny ? 'Бұл кезең бос' : 'Нәтижелер жақында';
  var note = hasAny ? 'Таңдалған сүзгі бойынша жарияланған есеп әзірге жоқ. Жоғарыдан басқа кезеңді, ағымды немесе пәнді таңдаңыз.' :
    (F.type === 'ls' ? 'ЛС анализі SapaLine сауалнамасы жабылып, ментор тексергеннен кейін осында жарияланады.' : F.type === 'st' ? 'СТ нәтижесі платформадан алынып, ментор анализі жазылғаннан кейін осында жарияланады.' : 'БТ анализін ментор енгізіп, жариялағаннан кейін осында көрсетіледі.');
  return '<section class="act teacher" data-theme="light" data-side="right" data-sig="1" data-flow="natural" data-fixed><div class="pin"><div class="ambient"></div><div class="flow"><div class="row"><div class="textCol">' +
    '<div class="badges"><span class="pill solid">' + T.short + ' · ' + esc(T.name) + '</span></div><h2 class="name">' + title + '</h2>' +
    '<p class="emptyNote">' + note + '</p>' +
    (canEdit() ? '<p class="emptyNote"><button class="aBtn primary onLight" type="button" data-open-admin>Әкімші бөлімінде есеп енгізу</button></p>' : '') +
    '</div></div></div></div></section>';
}

/* ================= roster ================= */
function rosterMetrics(e) {
  var m = e.metrics;
  if (e.type === 'ls') return '<span>Ұнату <b>' + fmtPct(m.like.pct) + '</b></span><span>Қатысым <b>' + fmtPct(m.attendance.pct) + '</b></span>';
  return '<span>Балл <b>' + fmtNum(m.score, 1) + (isNum(m.max) ? '<small>/' + fmtNum(m.max) + '</small>' : '') + '</b></span><span>Қайта тапсыру <b>' + fmtPct(m.retake && m.retake.pct, 1) + '</b></span>';
}
function comboChips(ids) {
  if (!ids.length) return '';
  return '<div class="comboChips" role="group" aria-label="Комбинация"><span class="comboLabel">Комбинация</span>' +
    '<button class="comboBtn" type="button" data-combo="all" aria-pressed="' + (F.combo === 'all') + '">Барлығы</button>' +
    ids.map(function (id) { var c = comboOf(id); return c ? '<button class="comboBtn" type="button" data-combo="' + esc(id) + '" aria-pressed="' + (F.combo === id) + '" title="' + esc(c.name) + '">' + esc(c.code) + '</button>' : ''; }).join('') + '</div>';
}
function rosterHTML(entries, periodLabel, comboIds) {
  var groups = [];
  entries.forEach(function (e, i) {
    var g = groups[groups.length - 1];
    if (!g || g.stream !== e.stream.id) groups.push(g = { stream: e.stream.id, name: e.stream.name, items: [] });
    g.items.push({ e: e, i: i });
  });
  var s = subjOf(F.subject);
  return '<section class="act roster" id="roster" data-theme="light" data-flow="natural" aria-label="Мұғалімдер тізімі"><div class="pin"><div class="ambient"></div><div class="flow">' +
    '<p class="rosterEyebrow">' + TYPES[F.type].short + ' · ' + esc(s ? s.name : 'Барлық пәндер') + ' · ' + esc(periodLabel) + '</p><h2 class="rosterTitle">Мұғалімдер</h2>' +
    '<p class="rosterHint">Атыңызды басыңыз — өз анализіңізге бірден өтесіз.</p>' +
    comboChips(comboIds) +
    groups.map(function (g) {
      return (groups.length > 1 || F.stream === 'all' ? '<p class="rosterGroup"><span>' + esc(g.name) + '</span></p>' : '') + '<div class="rosterGrid">' + g.items.map(function (x) {
        var e = x.e;
        return '<button class="rosterItem" type="button" data-go="' + x.i + '">' +
          '<span class="rosterNum">' + pad2(x.i) + '</span>' +
          '<span class="rosterPh" style="--tile:' + esc(e.subject.color || '') + '">' + (e.teacher && e.teacher.photo ? '<img src="' + esc(e.teacher.photo) + '" alt="" loading="lazy" decoding="async">' : '<b>' + esc(initials(e.teacher && e.teacher.name)) + '</b>') + '</span>' +
          '<span class="rosterTxt"><span class="rosterName">' + esc(e.teacher ? e.teacher.name : 'Мұғалім белгісіз') + '</span><span class="rosterCode">' + esc(e.subject.name) + ' · ' + esc(e.stream.short) + (e.draft ? ' · жоба' : '') + '</span></span>' +
          '<span class="rosterMetrics">' + rosterMetrics(e) + '</span>' +
          '<span class="rosterGo" aria-hidden="true">→</span></button>';
      }).join('') + '</div>';
    }).join('') +
    '</div></div></section>';
}

/* ================= teacher panels ================= */
function photoHTML(t, subject, i) {
  return '<div class="photoCol"><div class="photoFloat"><div class="photoFrame">' +
    (t && t.photo ? '<img src="' + esc(t.photo) + '" alt="' + esc(t.name) + '" decoding="async"' + (i > 1 ? ' loading="lazy"' : '') + '>'
      : '<div class="photoEmpty">' + subjEmblem(subject) + '<b>' + esc(initials(t && t.name)) + '</b><span>Фото кейін қосылады</span></div>') +
    '</div><div class="photoShadow"></div></div></div>';
}
function badges(e, extra) {
  var b = '<span class="pill solid">' + esc(e.subject.name) + '</span><span class="pill ghost">' + esc(e.period.label) + '</span><span class="pill ghost">' + esc(e.stream.name) + '</span>';
  if (F.combo !== 'all') { var c = comboOf(F.combo); b += '<span class="pill line">' + esc(c ? c.code : F.combo) + '</span>'; }
  if (extra) b += extra;
  if (e.draft) b += '<span class="pill draftPill">Жоба · жарияланбаған</span>';
  if (e.demo) b += '<span class="pill demoPill">Демо деректер</span>';
  return '<div class="badges">' + b + '</div>';
}
function votesHTML(L, A, X, T) {
  function row(lab, v, tone) {
    return '<div class="voteRow"><span class="voteLabel">' + lab + '</span><span class="voteTrack"><span class="voteBar" data-tone="' + tone + '" style="--w:' + (T ? (100 * v / T).toFixed(2) : 0) + ';--nz:' + (v > 0 ? 1 : 0) + '"></span></span><span class="voteVal">' + fmtInt(v) + '</span></div>';
  }
  return '<div class="votes">' + row('Ұнады', L, 1) + row('Орташа', A, 2) + row('Ұнамады', X, 3) + '</div>';
}
function understandingHTML(u) {
  if (!u || !u.lessons) return '';
  var max = 0; UNDERSTANDING.forEach(function (c) { max = Math.max(max, u.counts[c.key] || 0); });
  return '<div class="und"><p class="blockTitle">Тақырыпты түсіну <small>' + fmtInt(u.responses) + ' жауап · сауалнама санаттары</small></p>' +
    UNDERSTANDING.map(function (c, i) {
      var v = u.counts[c.key];
      return '<div class="voteRow undRow"><span class="voteLabel">' + c.label + '</span><span class="voteTrack"><span class="voteBar" data-tone="' + (i < 2 ? 1 : i < 4 ? 2 : 3) + '" style="--w:' + (u.responses ? (100 * (v || 0) / u.responses).toFixed(2) : 0) + ';--nz:' + (v > 0 ? 1 : 0) + '"></span></span><span class="voteVal">' + (v == null ? '—' : fmtInt(v)) + '</span></div>';
    }).join('') + '</div>';
}
function attendanceHTML(m, dyn) {
  var a = m.attendance;
  var detail = a.mode === 'weighted' ? fmtInt(a.present) + ' / ' + fmtInt(a.total) + ' · сабақтар бойынша қатысым' :
    a.mode === 'partial' ? fmtInt(a.present) + ' / ' + fmtInt(a.total) + ' · ' + a.pctOnlyLessons + ' сабақта тек пайыз болды, есепке кірмеді' :
    a.mode === 'average' ? 'Дереккөзде тек пайыз бар: сабақ пайыздарының орташа мәні (салмақсыз)' : 'Дерек әлі енгізілмеген';
  return '<div class="attendance"><span class="attendanceLabel">Қатысым</span><strong>' + fmtPct(a.pct) + '</strong>' +
    '<span class="attendanceDetail">' + esc(detail) + '</span>' +
    (a.overflow ? '<span class="attendanceDetail warnNote">100%-дан асты: басқа ағымнан қосылған оқушылар болуы мүмкін. Сан қиылмай көрсетілді.</span>' : '') +
    (isNum(a.pct) ? '<span class="attendanceTrack"><span style="width:' + Math.min(100, a.pct).toFixed(2) + '%"></span></span>' : '') +
    (dyn ? '<span class="attendanceDyn">' + dynChip(dyn, dyn.attendance) + '</span>' : '') + '</div>';
}
function sharedNote(m) {
  if (!m.shared || !m.shared.length) return '';
  var names = m.shared[0].combos.map(function (c) { var x = comboOf(c); return x ? x.code : c; }).join(' + ');
  return '<p class="sharedNote"><b>Ортақ сабақ</b> · ' + esc(names) + ': ' + m.shared.length + ' сабақ комбинацияларға бөлінбеген. Оның сандары тек «Барлығы» көрінісінде, бір рет есептеледі.</p>';
}
function lsBreakdown(e) {
  if (F.combo !== 'all' || !e.breakdown.length) return '';
  var rows = e.breakdown.map(function (b) {
    var c = comboOf(b.comboId), m = b.metrics;
    var only = m.lessons === 0 && m.shared.length;
    return '<tr><th>' + esc(c ? c.code : b.comboId) + '</th>' + (only ? '<td colspan="3" class="muted">ортақ сабақ — бөлініс жоқ</td>' :
      '<td>' + fmtPct(m.like.pct) + '</td><td>' + fmtPct(m.attendance.pct) + '</td><td>' + (isNum(m.attendance.total) ? fmtInt(m.attendance.present) + '/' + fmtInt(m.attendance.total) : '—') + '</td>') + '</tr>';
  }).join('');
  return '<div class="miniTable"><p class="blockTitle">Комбинациялар бойынша</p><table><thead><tr><th></th><th>Ұнату</th><th>Қатысым</th><th>Қатысты</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}
function mentorHTML(title, text, cls) {
  if (!text || !String(text).trim()) return '';
  return '<div class="mentorBlock ' + (cls || '') + '"><p class="blockTitle">' + esc(title) + '</p>' + richText(text) + '</div>';
}
function metaLine(e) {
  var bits = [];
  if (e.updatedBy) bits.push('Енгізген: ' + esc(e.updatedBy));
  if (e.updatedAt) bits.push('жаңартылды ' + esc(fmtDate(e.updatedAt)));
  var src = e.type === 'ls' ? (e.data.source === 'sapaline' ? 'SapaLine' : e.data.source === 'json' ? 'SapaLine (JSON)' : 'қолмен') : e.data.importedAt ? 'JUZ40 платформасы' : 'қолмен';
  bits.push('Дереккөз: ' + src);
  return '<p class="meta">' + bits.join(' · ') + '</p>';
}
function fmtDate(iso) {
  var d = new Date(iso); if (isNaN(d)) return '';
  return d.toLocaleString('kk-KZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
/** Бөлімнің соңындағы батырмалар: тікелей сілтеме және (ментор/әкімшіге) өңдеу. */
function ackInline(e) {
  if (!S.user && !(S.session && S.session.publicView)) return '';
  return '<div class="ackInline">' +
    '<button class="linkBtn" type="button" data-link="' + esc(e.id) + '" title="Осы есепке тікелей сілтеме">Сілтеме</button>' +
    (canEdit() ? '<button class="linkBtn" type="button" data-edit="' + esc(e.id) + '">Өңдеу</button>' : '') + '</div>';
}
function lessonsDetails(e) {
  var L = e.data.lessons || [], D = e.data.difficulties || [];
  if (!L.length && !D.some(function (d) { return d.student; })) return '';
  return '<details class="details"><summary>Толық есеп: сабақтар' + (D.some(function (d) { return d.student; }) ? ' және оқушылар' : '') + '</summary>' +
    (L.length ? '<div class="miniTable"><table><thead><tr><th>Күні</th><th>Тақырып</th><th>Комб.</th><th>Қатысты</th><th>Ұ/О/Ұм</th></tr></thead><tbody>' + L.map(function (l) {
      return '<tr><td>' + esc(l.date || '—') + '</td><td>' + esc(l.topic || '—') + '</td><td>' + esc((l.combos || []).map(function (c) { var x = comboOf(c); return x ? x.code : c; }).join('+') || '—') + (l.combos && l.combos.length > 1 ? (l.hasSplit ? ' <small>бөлінген</small>' : ' <small>ортақ</small>') : '') + '</td>' +
        '<td>' + (isNum(l.total) ? fmtInt(l.present) + '/' + fmtInt(l.total) : isNum(l.attendancePct) ? fmtPct(l.attendancePct) : '—') + '</td><td>' + (isNum(l.liked) ? l.liked + '/' + l.avg + '/' + l.disliked : '—') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '') +
    (D.some(function (d) { return d.student; }) ? '<div class="mentorBlock"><p class="blockTitle">Оқушылар бойынша</p><ul class="plain">' + D.filter(function (d) { return d.student; }).map(function (d) { return '<li><b>' + esc(d.student) + ':</b> ' + inline(d.text) + '</li>'; }).join('') + '</ul></div>' : '') +
    '</details>';
}
function lsPanel(e, i) {
  var m = e.metrics, dyn = e.dynamics;
  var like = m.like, T = like.responses || 0;
  var D = e.data.difficulties || [];
  var meta = [];
  if (m.lessons) meta.push(m.lessons + ' сабақ');
  if (T) meta.push(fmtInt(T) + ' оқушы бағалады');
  return '<div class="textCol">' + badges(e) +
    '<h2 class="name">' + esc(e.stream.short) + ' <i>|</i> ' + esc(e.teacher ? e.teacher.name : '—') + '</h2>' +
    '<div class="pctRow"><span class="pctNum">' + fmtNum(like.pct, 2) + '</span><span class="pctSign">' + (isNum(like.pct) ? '%' : '') + '</span><span class="pctCap">ұнату<br>пайызы</span></div>' +
    (isNum(like.pct) ? '<div class="pctTrack"><div class="pctFill" style="--pct:' + like.pct.toFixed(2) + '"></div></div>' : '') +
    '<div class="dynRow">' + dynChip(dyn, dyn && dyn.like, { big: true }) + '</div>' + flagsHTML(dyn) +
    attendanceHTML(m, dyn && dyn.status === 'ok' ? dyn : null) +
    (T ? votesHTML(like.liked, like.avg, like.disliked, T) : '<p class="meta">Сауалнама дерегі жоқ</p>') +
    (meta.length ? '<p class="meta">' + meta.join(' · ') + '</p>' : '') +
    sharedNote(m) + understandingHTML(m.understanding) + lsBreakdown(e) +
    (D.length ? '<div class="mentorBlock"><p class="blockTitle">Оқушылардың қиындықтары мен пікірлері</p><ul class="plain">' + D.map(function (d) { return '<li>' + inline(d.text) + (isNum(d.count) ? ' <small>· ' + d.count + ' оқушы</small>' : '') + '</li>'; }).join('') + '</ul></div>' : '') +
    mentorHTML('Ментор қорытындысы', e.data.mentor.summary) + mentorHTML('Келесі қадам', e.data.mentor.nextSteps, 'tips') +
    lessonsDetails(e) + metaLine(e) + ackInline(e) + '</div>' + photoHTML(e.teacher, e.subject, i);
}
var LETTERS = 'ABCDEFGHIJKLMNOPQRST';
function optionsHTML(t) {
  var ops = t.options || [];
  if (!ops.length) return '';
  var known = ops.every(function (o) { return isNum(o.picks); });
  var total = known ? ops.reduce(function (a, o) { return a + o.picks; }, 0) : 0;
  var maxWrong = -1, maxWrongI = -1;
  if (known) ops.forEach(function (o, i) { if (!o.correct && o.picks > maxWrong) { maxWrong = o.picks; maxWrongI = i; } });
  return '<div class="opts"><p class="blockTitle">Жауап нұсқалары' + (known ? ' <small>неше оқушы таңдады' + (t.several ? ' · бірнеше дұрыс жауап' : '') + '</small>' : '') + '</p>' +
    ops.map(function (o, i) {
      var pct = known && total ? (100 * o.picks / total) : null;
      var trap = known && i === maxWrongI && maxWrong > 0;
      return '<div class="opt' + (o.correct ? ' ok' : '') + (trap ? ' trap' : '') + '">' +
        '<span class="optL">' + LETTERS.charAt(i) + '</span>' +
        '<span class="optT">' + (o.html ? '<span class="rich">' + o.html + '</span>' : '<span class="rich">' + chemSub(inline(o.text || '')) + '</span>') +
        (o.image ? '<img src="' + esc(o.image) + '" alt="' + LETTERS.charAt(i) + ' нұсқасының суреті" loading="lazy">' : '') +
        (o.correct ? '<em class="optTag">дұрыс жауап</em>' : trap ? '<em class="optTag">ең көп таңдалған қате</em>' : '') + '</span>' +
        (known ? '<span class="optBar"><span style="width:' + (pct || 0).toFixed(1) + '%"></span></span><span class="optN"><b>' + o.picks + '</b>' + (pct != null ? ' · ' + fmtNum(pct, 0) + '%' : '') + '</span>' : '') +
        '</div>';
    }).join('') + '</div>';
}
function pairsHTML(t) {
  if (!t.pairs || !t.pairs.length) return '';
  return '<div class="opts"><p class="blockTitle">Сәйкестендіру (дұрыс жұптар)</p>' + t.pairs.map(function (p) { return '<div class="opt ok"><span class="optT"><span class="rich">' + chemSub(inline(p.left)) + ' → <b>' + chemSub(inline(p.right)) + '</b></span></span></div>'; }).join('') + '</div>';
}
function taskHTML(t) {
  var body = t.html ? '<div class="rich taskText">' + t.html + '</div>' : (function () { var h = richText(t.text, 'taskText'); return t.fromPlatform ? chemSub(h) : h; })();
  return '<article class="task"><header class="taskHead">' +
    (isNum(t.variant) ? '<span class="chipS">' + t.variant + '-нұсқа</span>' : '') + (isNum(t.q) ? '<span class="chipS">№' + t.q + '</span>' : '') +
    (t.topic ? '<span class="chipS ghost">' + esc(t.topic) + '</span>' : '') +
    (isNum(t.wrongPct) ? '<span class="taskPct"><b>' + fmtNum(t.wrongPct, 0) + '%</b> қателесті</span>' : '') + '</header>' +
    (t.title ? '<h4 class="taskTitle">' + inline(t.title) + '</h4>' : '') + body +
    (t.images && t.images.length ? '<div class="taskImgs">' + t.images.filter(function (u) { return /^(https?:|\/api\/)/.test(u); }).map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="Есептің суреті" loading="lazy"></a>'; }).join('') + '</div>' : '') +
    optionsHTML(t) + pairsHTML(t) +
    (isNum(t.answered) ? '<p class="meta">' + t.answered + ' оқушы жауап берді</p>' : '') +
    (t.explanation ? '<div class="taskExpl"><p class="blockTitle">Түсіндірме</p>' + richText(t.explanation) + '</div>' : '') + '</article>';
}
function stPanel(e, i) {
  var m = e.metrics, dyn = e.dynamics;
  var srcName = { platform: 'Платформа нәтижесі', manual: 'Ментор енгізген жалпы мән', weighted: 'Комбинациялар бойынша салмақталған', combo: 'Комбинация нәтижесі' }[m.source] || '';
  var r = m.retake || {};
  var retakeDetail = r.source === 'counts' || r.source === 'weighted' ? fmtInt(r.count) + ' / ' + fmtInt(r.base) + ' оқушы' : r.source === 'reported' ? (isNum(r.count) ? fmtInt(r.count) + ' оқушы · ' : '') + 'пайыз дереккөзден, бөлгіші белгісіз' : m.level === 'all' && r.reason === 'no_base' ? 'Барлық комбинацияның бөлгіші белгісіз — жалпы үлес есептелмеді' : 'Дерек әлі енгізілмеген';
  var combos = F.combo === 'all' ? e.breakdown : [];
  var tasks = e.data.hardTasks || [];
  return '<div class="textCol">' + badges(e) +
    '<h2 class="name">' + esc(e.stream.short) + ' <i>|</i> ' + esc(e.teacher ? e.teacher.name : '—') + '</h2>' +
    (m.missing ? '<p class="emptyNote">Бұл комбинацияға жеке нәтиже енгізілмеген.</p>' :
    '<div class="pctRow"><span class="pctNum">' + fmtNum(m.score, 1) + '</span><span class="pctSign">' + (isNum(m.max) ? '/' + fmtNum(m.max) : '') + '</span><span class="pctCap">ортақ<br>балл</span></div>' +
    (isNum(m.score) && isNum(m.max) && m.max > 0 ? '<div class="pctTrack"><div class="pctFill" style="--pct:' + (100 * m.score / m.max).toFixed(2) + '"></div></div>' : '') +
    (m.reason === 'no_weights' ? '<p class="meta warnNote">Комбинациялардың тапсырған саны белгісіз — жай орташа жалпы нәтиже ретінде көрсетілмейді.</p>' : '') +
    '<div class="dynRow">' + dynChip(dyn, dyn && dyn.score, { big: true }) + '</div>' + flagsHTML(dyn) +
    '<p class="meta">' + esc(srcName) + (m.source === 'platform' && e.data.scoreMethod === 'groups' && e.data.groupCount ? ' · ' + e.data.groupCount + ' топтың орташа балдарының орташасы' : m.source === 'platform' && e.data.scoreMethod === 'students' ? ' · барлық оқушы бойынша' : '') + (isNum(m.submitted) ? ' · ' + fmtInt(m.submitted) + ' оқушы тапсырды' + (isNum(m.total) ? ' (' + fmtInt(m.total) + ' ішінен)' : '') : '') + '</p>' +
    '<div class="attendance"><span class="attendanceLabel">Қайта тапсыру</span><strong>' + fmtPct(r.pct, 1) + '</strong><span class="attendanceDetail">' + esc(retakeDetail) + '</span>' +
    (dyn && dyn.status === 'ok' ? '<span class="attendanceDyn">' + dynChip(dyn, dyn.retake) + '</span>' : '') + '</div>') +
    (combos.length ? '<div class="miniTable"><p class="blockTitle">Комбинациялар бойынша</p><table><thead><tr><th></th><th>Балл</th><th>Тапсырды</th><th>Қайта тапсыру</th></tr></thead><tbody>' + combos.map(function (b) {
      var c = comboOf(b.comboId), x = b.metrics;
      return '<tr><th>' + esc(c ? c.code : b.comboId) + '</th><td>' + fmtNum(x.score, 1) + (isNum(x.max) ? '<small>/' + fmtNum(x.max) + '</small>' : '') + '</td><td>' + fmtInt(x.submitted) + '</td><td>' + fmtPct(x.retake.pct, 1) + (isNum(x.retake.count) ? ' <small>' + x.retake.count + (isNum(x.retake.base) ? '/' + x.retake.base : '') + '</small>' : '') + '</td></tr>' +
        (x.note ? '<tr class="noteRow"><td></td><td colspan="3">' + inline(x.note) + '</td></tr>' : '');
    }).join('') + '</tbody></table></div>' : '') +
    (F.combo !== 'all' && m.note ? mentorHTML('Комбинация бойынша талдау', m.note) : '') +
    mentorHTML('Комбинациялар бойынша талдау', F.combo === 'all' ? e.data.mentor.combosAnalysis : '') +
    (tasks.length ? '<div class="tasks"><p class="blockTitle">Қиын болған тапсырмалар <small>' + tasks.length + '</small></p>' + tasks.map(taskHTML).join('') + '</div>' : '') +
    (e.data.topics && e.data.topics.length ? '<p class="meta">Тақырыптар: ' + e.data.topics.map(esc).join(' · ') + '</p>' : '') +
    mentorHTML('Мұғалімге қорытынды', e.data.mentor.summary) + mentorHTML('Келесі аптаға ұсыныс', e.data.mentor.recommendation, 'tips') +
    metaLine(e) + ackInline(e) + '</div>' + photoHTML(e.teacher, e.subject, i);
}
function actOpen(i, extraAttr, subj) {
  extraAttr = (extraAttr || '') + ' data-subj="' + esc(subj || pageSubj()) + '"';
  var theme = i % 2 === 0 ? 'dark' : 'light', side = i % 2 === 0 ? 'right' : 'left', sig = (i % 5) + 1;
  return '<section class="act teacher" data-theme="' + theme + '" data-side="' + side + '" data-sig="' + sig + '" data-idx="' + i + '" style="--fd:' + (-1.3 * i).toFixed(1) + 's"' + (extraAttr || '') + '>' +
    '<div class="pin"><div class="ambient"></div><div class="numeral" aria-hidden="true">' + pad2(i) + '</div><div class="flow"><div class="row">';
}
var ACT_CLOSE = '</div></div></div></section>';

/* ---------- БТ ---------- */
function topList(list, cls) {
  if (!list || !list.length) return '';
  return '<ol class="top3 ' + (cls || '') + '">' + list.map(function (x) {
    return '<li><span class="topRank">' + x.rank + (x.tie ? '<small>тең</small>' : '') + '</span><span class="topName">' + esc(x.name) + '</span><span class="topScore">' + (isNum(x.score) ? fmtNum(x.score) : '') + '</span></li>';
  }).join('') + '</ol>';
}
function btOverallAct(b, i) {
  var o = b.overall || {};
  return actOpen(i, ' data-bt="' + esc(b.id) + '" id="r-' + esc(b.id) + '"') + '<div class="textCol wide">' +
    '<div class="badges"><span class="pill solid">БТ · жалпы</span><span class="pill ghost">' + esc(b.period.label) + '</span><span class="pill ghost">' + esc(b.stream.name) + '</span>' +
    (b.scope ? '<span class="pill line">' + esc(b.scope.code) + '</span>' : '') + (b.period.cohort ? '<span class="pill line">' + esc(b.period.cohort) + '</span>' : '') +
    (b.draft ? '<span class="pill draftPill">Жоба · жарияланбаған</span>' : '') + (b.demo ? '<span class="pill demoPill">Демо деректер</span>' : '') + '</div>' +
    '<h2 class="name">' + esc(b.stream.short) + (b.scope ? ' <i>|</i> ' + esc(b.scope.code) : '') + ' <i>|</i> Жалпы нәтиже</h2>' +
    '<div class="pctRow"><span class="pctNum">' + fmtNum(o.avg, 1) + '</span><span class="pctSign">' + (isNum(o.max) ? '/' + fmtNum(o.max) : '') + '</span><span class="pctCap">жалпы<br>ортақ балл</span></div>' +
    '<div class="dynRow">' + dynChip(b.dynamics, b.dynamics && b.dynamics.score, { big: true }) + '</div>' + flagsHTML(b.dynamics) +
    '<p class="meta">' + (isNum(b.participants) ? fmtInt(b.participants) + ' оқушы тапсырды · ' : '') + b.allSubjects + ' пән/көрсеткіш</p>' +
    '<div class="btGrid">' +
    (b.top3.length ? '<div class="mentorBlock"><p class="blockTitle">Жалпы ТОП-3</p>' + topList(b.top3) + '</div>' : '') +
    (b.subjects.length ? '<div class="miniTable"><p class="blockTitle">Пәндер бойынша ортақ балл</p><table><tbody>' + b.subjects.map(function (s) {
      return '<tr><th>' + esc(s.label) + (s.extra ? ' <small>қосымша</small>' : '') + '</th><td>' + fmtNum(s.avg, 1) + (isNum(s.max) ? '<small>/' + fmtNum(s.max) + '</small>' : '') + '</td><td>' + (s.dynamics.status === 'ok' ? esc(fmtDelta(s.dynamics.score)) : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '') + '</div>' +
    (b.hardTopics.length ? '<div class="mentorBlock"><p class="blockTitle">Ең қиын тақырыптар</p><ul class="plain">' + b.hardTopics.map(function (t) { return '<li>' + inline(t) + '</li>'; }).join('') + '</ul></div>' : '') +
    mentorHTML('Жалпы талдау', b.analysis) + mentorHTML('Келесі кезеңге әрекет жоспары', b.actionPlan, 'tips') +
    btMeta(b) + btAck(b) + '</div>' + ACT_CLOSE;
}
function btMeta(b) { return '<p class="meta">' + (b.updatedBy ? 'Енгізген: ' + esc(b.updatedBy) + ' · ' : '') + 'жаңартылды ' + esc(fmtDate(b.updatedAt)) + ' · Дереккөз: ментор</p>'; }
function btAck(b) { return ackInline({ id: b.id }); }
function btSubjectAct(b, s, i) {
  var t = s.teacher;
  var fake = { id: s.subjectId || s.label, glyph: s.glyph || (s.label || '').slice(0, 2) };
  return actOpen(i, ' data-bt-subj="' + esc(b.id + ':' + (s.subjectId || s.label)) + '"', s.subjectId || 'all') + '<div class="textCol">' +
    '<div class="badges"><span class="pill solid">' + esc(s.label) + '</span><span class="pill ghost">БТ · ' + esc(b.period.label) + '</span><span class="pill ghost">' + esc(b.stream.name) + '</span>' + (b.scope ? '<span class="pill line">' + esc(b.scope.code) + '</span>' : '') + (s.extra ? '<span class="pill line">Қосымша көрсеткіш</span>' : '') + '</div>' +
    '<h2 class="name">' + esc(b.stream.short) + ' <i>|</i> ' + esc(t ? t.name : s.label) + '</h2>' +
    '<div class="pctRow"><span class="pctNum">' + fmtNum(s.avg, 1) + '</span><span class="pctSign">' + (isNum(s.max) ? '/' + fmtNum(s.max) : '') + '</span><span class="pctCap">пәннің<br>ортақ балы</span></div>' +
    (isNum(s.avg) && isNum(s.max) && s.max > 0 ? '<div class="pctTrack"><div class="pctFill" style="--pct:' + (100 * s.avg / s.max).toFixed(2) + '"></div></div>' : '') +
    '<div class="dynRow">' + dynChip(s.dynamics, s.dynamics && s.dynamics.score, { big: true }) + '</div>' +
    '<p class="meta">Жалпы контекст: ' + fmtNum(b.overall && b.overall.avg, 1) + (b.overall && isNum(b.overall.max) ? '/' + fmtNum(b.overall.max) : '') + ' жалпы ортақ балл' + (isNum(s.participants) ? ' · ' + fmtInt(s.participants) + ' оқушы' : '') + '</p>' +
    (s.top3.length ? '<div class="mentorBlock"><p class="blockTitle">Пән бойынша ТОП-3</p>' + topList(s.top3) + '</div>' : '') +
    (s.hardTopics.length ? '<div class="mentorBlock"><p class="blockTitle">Ең қиын тақырыптар</p><ul class="plain">' + s.hardTopics.map(function (x) { return '<li>' + inline(x) + '</li>'; }).join('') + '</ul></div>' : '') +
    mentorHTML('Мұғалімге ұсыныс', s.recommendation, 'tips') + '</div>' +
    (t || !s.extra ? photoHTML(t, s.subjectId ? subjOf(s.subjectId) : fake, i) : photoHTML(null, fake, i)) + ACT_CLOSE;
}

/* ---------- outro ---------- */
function outroHTML(theme, stats) {
  return '<section class="act outro" data-theme="' + theme + '"><div class="pin"><div class="ambient"></div><div class="outroRing"></div><div class="flow">' +
    '<p class="outroEyebrow">' + esc(stats.period) + ' · қорытынды</p><h2 class="outroTitle">Еңбектеріңізге алғыс!</h2>' +
    '<p class="outroText">Бұл сандар — оқушылардың шын дауысы және ментордың талдауы. Келесі кезеңде де прогресс жасайтынымызға сенеміз.</p>' +
    '<p class="outroStat">' + stats.items.map(function (s) { return '<span>' + esc(s[0]) + ' <b>' + s[1] + '</b></span>'; }).join('') + '</p>' +
    '<div class="footMark"><span class="footDot"></span><span class="footText">JUZ40 · SMART PRO</span></div>' +
    '</div></div></section>';
}
function outroStats() {
  var v = S.view, period = (v.periods.filter(function (p) { return p.key === v.period; })[0] || {}).label || '';
  var items = [];
  if (F.type === 'ls') {
    var L = 0, R = 0, P = 0, Tt = 0;
    v.entries.forEach(function (e) { var m = e.metrics; if (isNum(m.like.responses)) { L += m.like.liked; R += m.like.responses; } if (isNum(m.attendance.total) && m.attendance.mode !== 'average') { P += m.attendance.present; Tt += m.attendance.total; } });
    items.push(['Жалпы ұнату', R ? fmtPct(ratio(L, R)) : '—'], ['Мұғалім', String(v.entries.length)]);
    if (R) items.push(['Жауап', fmtInt(R)]);
    if (Tt) items.push(['Қатысым', fmtPct(ratio(P, Tt))]);
  } else if (F.type === 'st') {
    items.push(['Есеп', String(v.entries.length)]);
    var withScore = v.entries.filter(function (e) { return isNum(e.metrics.score); }).length;
    items.push(['Балл енгізілген', String(withScore)]);
  } else {
    items.push(['БТ есебі', String(v.bt.length)]);
    var subjCount = v.bt.reduce(function (a, b) { return a + b.subjects.length; }, 0);
    items.push(['Пәндік нәтиже', String(subjCount)]);
  }
  return { period: period, items: items };
}

/* ================= render ================= */
var acts = [], panels = [];
function renderActs() {
  var html = '';
  panels = [];
  if (!S.user && !(S.session && S.session.publicView)) {
    html = loginHTML(S.session && !S.session.dbOk ? S.session.dbMessage : '');
  } else if (!S.view) {
    html = introHTML(null, false);
  } else {
    var v = S.view;
    var period = (v.periods.filter(function (p) { return p.key === v.period; })[0] || {}).label || '';
    if (F.type !== 'bt') {
      var entries = v.entries;
      var comboIds = [];
      entries.forEach(function (e) { e.breakdown.forEach(function (b) { if (comboIds.indexOf(b.comboId) < 0) comboIds.push(b.comboId); }); });
      if (F.combo !== 'all' && comboIds.indexOf(F.combo) < 0) comboIds.push(F.combo);
      html += introHTML({ period: period }, entries.length > 0);
      if (entries.length) {
        html += rosterHTML(entries, period, comboIds);
        entries.forEach(function (e, i) {
          panels.push(e.id);
          html += actOpen(i, ' id="r-' + esc(e.id) + '"', e.subject.id) + (e.type === 'ls' ? lsPanel(e, i) : stPanel(e, i)) + ACT_CLOSE;
        });
        html += outroHTML(entries.length % 2 === 1 ? 'light' : 'dark', outroStats());
      } else html += emptyHTML(v.periods.length > 0);
    } else {
      var i = 0;
      html += introHTML({ period: period }, v.bt.length > 0);
      if (v.bt.length) {
        html += btRosterHTML(v.bt, period);
        v.bt.forEach(function (b) {
          panels.push(b.id); html += btOverallAct(b, i++);
          b.subjects.forEach(function (s) { panels.push(b.id + ':' + (s.subjectId || s.label)); html += btSubjectAct(b, s, i++); });
        });
        html += outroHTML(i % 2 === 1 ? 'light' : 'dark', outroStats());
      } else html += emptyHTML(v.periods.length > 0);
    }
  }
  $('#acts').innerHTML = html;
  acts = $$('#acts > .act');
  acts.forEach(function (a) { if (!a.hasAttribute('data-subj')) a.setAttribute('data-subj', pageSubj()); });
  var rail = $('#railNums');
  var n = $$('#acts > .act.teacher[data-idx]').length;
  var railItems = []; for (var k = 0; k < n; k++) railItems.push('<span data-i="' + k + '">' + pad2(k) + '</span>');
  rail.innerHTML = n > 40 ? '' : railItems.join('');
  if (n) $('.rail').removeAttribute('data-empty'); else $('.rail').setAttribute('data-empty', '');
  layout();
  update();
  typesetMath($('#acts'));
  if (!reduceMotion) { var intro = $('.act.intro'); if (intro) intro.classList.add('boot'); }
}
function btRosterHTML(list, period) {
  var i = 0, combosIn = [];
  list.forEach(function (b) { if (b.scope && combosIn.indexOf(b.scope.id) < 0) combosIn.push(b.scope.id); });
  return '<section class="act roster" id="roster" data-theme="light" data-flow="natural" aria-label="БТ нәтижелері"><div class="pin"><div class="ambient"></div><div class="flow">' +
    '<p class="rosterEyebrow">БТ · ' + esc(period) + '</p><h2 class="rosterTitle">Нәтижелер</h2>' +
    '<p class="rosterHint">Жалпы есепті немесе өз пәніңізді таңдаңыз. Бір БТ есебі барлық пәнге ортақ: әр мұғалім өз пәнінің нәтижесін және жалпы контекстті көреді.</p>' +
    comboChips(combosIn) +
    list.map(function (b) {
      var items = [{ label: 'Жалпы нәтиже', sub: (b.scope ? b.scope.code + ' · ' : '') + b.stream.short, metric: fmtNum(b.overall && b.overall.avg, 1), idx: i++, glyph: 'БТ' }];
      b.subjects.forEach(function (s) { items.push({ label: s.teacher ? s.teacher.name : s.label, sub: s.label + ' · ' + b.stream.short, metric: fmtNum(s.avg, 1) + (isNum(s.max) ? '<small>/' + fmtNum(s.max) + '</small>' : ''), idx: i++, photo: s.teacher && s.teacher.photo, glyph: s.glyph || s.label.slice(0, 2) }); });
      return '<p class="rosterGroup"><span>' + esc(b.stream.name) + (b.scope ? ' · ' + esc(b.scope.code) : '') + '</span></p><div class="rosterGrid">' + items.map(function (x) {
        return '<button class="rosterItem" type="button" data-go="' + x.idx + '"><span class="rosterNum">' + pad2(x.idx) + '</span>' +
          '<span class="rosterPh">' + (x.photo ? '<img src="' + esc(x.photo) + '" alt="" loading="lazy">' : '<b>' + esc(x.photo === undefined ? x.glyph : initials(x.label)) + '</b>') + '</span>' +
          '<span class="rosterTxt"><span class="rosterName">' + esc(x.label) + '</span><span class="rosterCode">' + esc(x.sub) + '</span></span>' +
          '<span class="rosterMetrics"><span>Балл <b>' + x.metric + '</b></span></span><span class="rosterGo" aria-hidden="true">→</span></button>';
      }).join('') + '</div>';
    }).join('') + '</div></div></section>';
}
function pageSubj() { return subjOf(F.subject) ? F.subject : 'all'; }
function renderAll() {
  injectPalettes();
  document.documentElement.setAttribute('data-subj', pageSubj());
  root.setAttribute('data-subj', pageSubj());
  renderHeader();
  renderActs();
  rainSetGlyphs();
}

/* ================= data loading ================= */
var viewSeq = 0;
function loadView(opts) {
  opts = opts || {};
  var seq = ++viewSeq;
  var q = '/api/view?type=' + F.type + '&stream=' + encodeURIComponent(F.stream) + '&subject=' + encodeURIComponent(F.subject) + '&combo=' + encodeURIComponent(F.combo) + (F.period ? '&period=' + encodeURIComponent(F.period) : '') + (S.drafts ? '&drafts=1' : '');
  return api('GET', q).then(function (v) {
    if (seq !== viewSeq) return;
    S.view = v;
    if (F.period !== v.period) F.period = v.period;
    writeURL(opts.keepHash ? null : '');
    return v;
  }).catch(function (e) {
    if (seq !== viewSeq) return;
    if (e.status === 401) { S.user = null; S.view = null; }
    toast(e.message, 'bad');
  });
}
function refresh(opts) {
  opts = opts || {};
  var swap = function () { renderAll(); if (opts.after) opts.after(); };
  return loadView(opts).then(function () {
    if (opts.curtain) withCurtain(swap); else swap();
  });
}
function scrollToHash() {
  var h = (location.hash || '').replace(/^#/, '');
  if (!h) return;
  var el = document.getElementById(h);
  if (el) setTimeout(function () { goTo(el, true); }, 60);
}

/* ================= layout + scroll engine (lskb) ================= */
var smallMQ = window.matchMedia ? matchMedia('(max-width: 760px)') : { matches: false };
function layout() {
  var vh = window.innerHeight;
  acts.forEach(function (act) {
    if (!act.classList.contains('teacher')) return;
    if (act.getAttribute('data-flow') === 'natural' && act.hasAttribute('data-fixed')) return;
    if (smallMQ.matches) { act.setAttribute('data-flow', 'natural'); return; }
    act.removeAttribute('data-flow');
    var flow = $('.flow', act), row = $('.row', act);
    if (!flow || !row) return;
    var cs = getComputedStyle(flow);
    var need = row.scrollHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    if (need > vh + 2) act.setAttribute('data-flow', 'natural');
  });
}
var ticking = false;
function onScroll() { if (ticking) return; ticking = true; requestAnimationFrame(function () { ticking = false; update(); }); }
var hdrTheme = 'dark';
function update() {
  var vh = window.innerHeight, theme = 'dark', active = -1;
  for (var i = 0; i < acts.length; i++) {
    var act = acts[i], r = act.getBoundingClientRect();
    var isTeacher = act.classList.contains('teacher') && act.hasAttribute('data-idx');
    if (r.top <= 52 && r.bottom > 52) theme = act.getAttribute('data-theme');
    if (isTeacher && r.top < vh * 0.55 && r.bottom > vh * 0.45) active = +act.getAttribute('data-idx');
    if (r.bottom < -vh || r.top > vh * 1.6) continue;
    var natural = act.getAttribute('data-flow') === 'natural' || smallMQ.matches;
    var a = 1, x = 0;
    if (!reduceMotion && !act.classList.contains('intro')) a = clamp((vh * 0.94 - r.top) / (vh * (natural ? 0.5 : 0.68)), 0, 1);
    if (!reduceMotion && !natural) { var hold = r.height - vh; if (hold > vh * 0.3) x = clamp((-r.top - hold + vh * 0.3) / (vh * 0.3), 0, 1); }
    act.style.setProperty('--a', a.toFixed(3));
    act.style.setProperty('--x', x.toFixed(3));
  }
  var subjNow = pageSubj();
  for (var q = 0; q < acts.length; q++) { var rr = acts[q].getBoundingClientRect(); if (rr.top <= 52 && rr.bottom > 52) { subjNow = acts[q].getAttribute('data-subj') || subjNow; break; } }
  if (root.getAttribute('data-subj') !== subjNow) { root.setAttribute('data-subj', subjNow); rain.color = null; }
  if (theme !== hdrTheme) { hdrTheme = theme; root.setAttribute('data-hdr', theme); rain.color = null; }
  var nums = $$('#railNums span');
  nums.forEach(function (s, j) { if (j === active) s.setAttribute('data-on', ''); else s.removeAttribute('data-on'); });
  var dot = $('#railDot'), rn = $('#railNums'), list = $('#roster'), first = $('.act.teacher[data-idx="0"]');
  if (nums.length && dot) {
    var before = first && first.getBoundingClientRect().top > vh * 0.45;
    var target = active >= 0 ? nums[active] : (before ? nums[0] : nums[nums.length - 1]);
    if (target) dot.style.top = (rn.offsetTop + target.offsetTop + target.offsetHeight / 2 - 4.5) + 'px';
  }
  var fab = $('#toList'), show = !!list && list.getBoundingClientRect().bottom < vh * 0.35;
  if (fab && fab.hasAttribute('data-on') !== show) { if (show) fab.setAttribute('data-on', ''); else fab.removeAttribute('data-on'); }
}
function goTo(el, instant) {
  if (!el) return;
  function to(y) { try { window.scrollTo({ top: y, behavior: 'instant' }); } catch (e) { window.scrollTo(0, y); } }
  function jump() {
    var off = smallMQ.matches && el.classList.contains('teacher') ? 0 : 0;
    to(Math.round(el.getBoundingClientRect().top + window.scrollY - off));
    update();
    requestAnimationFrame(function () { var t = el.getBoundingClientRect().top; if (Math.abs(t) > 2) { to(Math.round(t + window.scrollY)); update(); } });
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    try { el.focus({ preventScroll: true }); } catch (e) {}
  }
  if (reduceMotion || instant) { jump(); return; }
  root.setAttribute('data-jump', '');
  setTimeout(function () { jump(); requestAnimationFrame(function () { root.removeAttribute('data-jump'); }); }, 170);
}
window.addEventListener('scroll', onScroll, { passive: true });
var resizeT = 0;
window.addEventListener('resize', function () { clearTimeout(resizeT); resizeT = setTimeout(function () { layout(); update(); rainResize(); }, 120); });

/* ================= glyph rain (lskb) ================= */
var rain = { cv: $('#rain'), ctx: null, cols: [], glyphs: ['Σ', '%', '+', '△'], w: 0, h: 0, dpr: 1, last: 0, color: null, run: false };
function glyphsNow() {
  var s = subjOf(F.subject);
  if (s && s.glyphs) return s.glyphs.split(/\s+/).filter(Boolean);
  var all = [];
  cat().subjects.forEach(function (x) { (x.glyphs || '').split(/\s+/).slice(0, 5).forEach(function (g) { if (g) all.push(g); }); });
  return all.length ? all : ['Σ', '%', '△'];
}
function rainResize() {
  var cv = rain.cv; if (!cv || !cv.getContext) return;
  rain.dpr = Math.min(2, window.devicePixelRatio || 1);
  rain.w = window.innerWidth; rain.h = window.innerHeight;
  cv.width = Math.round(rain.w * rain.dpr); cv.height = Math.round(rain.h * rain.dpr);
  rain.ctx = cv.getContext('2d'); rain.ctx.setTransform(rain.dpr, 0, 0, rain.dpr, 0, 0);
  var n = Math.max(4, Math.floor(rain.w / 74));
  rain.cols = [];
  for (var i = 0; i < n; i++) rain.cols.push(newCol(i, n, true));
  if (reduceMotion) drawRain(0);
}
function newCol(i, n, initial) {
  var len = 5 + Math.floor(Math.random() * 10), seq = [];
  for (var j = 0; j < len; j++) seq.push(rain.glyphs[Math.floor(Math.random() * rain.glyphs.length)]);
  return { x: (i + 0.25 + Math.random() * 0.5) * rain.w / n, y: initial ? Math.random() * rain.h * 1.4 - rain.h * 0.2 : -Math.random() * rain.h * 0.6, v: 10 + Math.random() * 26, size: 12 + Math.round(Math.random() * 4), seq: seq, flip: 0 };
}
function rainSetGlyphs() {
  var g = glyphsNow();
  rain.glyphs = g;
  rain.cols.forEach(function (c) { c.seq = c.seq.map(function () { return g[Math.floor(Math.random() * g.length)]; }); });
  if (reduceMotion) drawRain(0);
}
function inkRGB() {
  var v = getComputedStyle(root).getPropertyValue('--ink').trim();
  var m = /^#?([0-9a-f]{6})$/i.exec(v);
  if (!m) return hdrTheme === 'light' ? '27,54,176' : '201,225,255';
  var n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',');
}
function drawRain(dt) {
  var ctx = rain.ctx; if (!ctx) return;
  if (!rain.color) rain.color = inkRGB();
  ctx.clearRect(0, 0, rain.w, rain.h);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (var i = 0; i < rain.cols.length; i++) {
    var c = rain.cols[i];
    c.y += c.v * dt;
    var lh = c.size * 1.35;
    if (c.y - c.seq.length * lh > rain.h) { rain.cols[i] = newCol(i, rain.cols.length, false); continue; }
    c.flip += dt;
    if (c.flip > 0.9) { c.flip = 0; c.seq[Math.floor(Math.random() * c.seq.length)] = rain.glyphs[Math.floor(Math.random() * rain.glyphs.length)]; }
    ctx.font = '500 ' + c.size + 'px "Noto Sans Math","JUZ40","Golos Text",serif';
    for (var j = 0; j < c.seq.length; j++) {
      var y = c.y - j * lh; if (y < -lh || y > rain.h + lh) continue;
      var alpha = j === 0 ? 1 : Math.max(0, 0.85 - j / c.seq.length);
      ctx.fillStyle = 'rgba(' + rain.color + ',' + alpha.toFixed(3) + ')';
      ctx.fillText(c.seq[j], c.x, y);
    }
  }
}
function rainLoop(t) {
  if (!rain.run) return;
  var dt = rain.last ? Math.min(0.1, (t - rain.last) / 1000) : 0;
  if (dt === 0 || dt > 1 / 32) { rain.last = t; drawRain(dt || 0.016); }
  requestAnimationFrame(rainLoop);
}
function rainStart() { rainResize(); if (reduceMotion) return; rain.run = true; rain.last = 0; requestAnimationFrame(rainLoop); }
document.addEventListener('visibilitychange', function () {
  if (reduceMotion) return;
  if (document.hidden) rain.run = false; else if (!rain.run) { rain.run = true; rain.last = 0; requestAnimationFrame(rainLoop); }
});

/* ================= curtain (lskb) ================= */
function jumpTop() { try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (e) { window.scrollTo(0, 0); } }
var curtainBusy = false;
function curtainEmblem() { var s = subjOf(F.subject); return s ? subjTile(s, 'curtainTile') : spTile('curtainTile'); }
function withCurtain(swap) {
  if (reduceMotion || curtainBusy) { swap(); jumpTop(); return; }
  curtainBusy = true;
  var c = $('#curtain');
  c.setAttribute('data-subj', pageSubj());
  $('#curtainZ').innerHTML = curtainEmblem();
  c.removeAttribute('data-out'); c.hidden = false;
  $$('#curtain, #curtain *').forEach(function (el) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; });
  setTimeout(function () {
    swap(); jumpTop();
    c.setAttribute('data-out', '');
    setTimeout(function () { c.hidden = true; c.removeAttribute('data-out'); curtainBusy = false; }, 460);
  }, 900);
}
/* ================= events ================= */
document.addEventListener('click', function (ev) {
  var t = ev.target;
  if (!t.closest) return;
  if (t.closest('#picker')) {
    var pi = t.closest('.pickItem');
    if (pi) {
      var k = pi.getAttribute('data-subj'); closePicker();
      if (k !== F.subject) { F.subject = k; F.combo = 'all'; refresh({ curtain: true }); }
      return;
    }
    if (t.closest('[data-close]') || t === $('#picker')) closePicker();
    return;
  }
  if (t.closest('#subjPick')) { if ($('#picker').hidden) openPicker(); else closePicker(); return; }
  var go = t.closest('#acts [data-go]');
  if (go) {
    var g = go.getAttribute('data-go');
    var target = g === 'roster' ? $('#roster') : $('.act.teacher[data-idx="' + g + '"]');
    goTo(target);
    if (target && target.id) writeURL('#' + target.id);
    return;
  }
  if (t.closest('#toList')) { goTo($('#roster')); writeURL(''); return; }
  var rn = t.closest('#railNums span');
  if (rn) { goTo($('.act.teacher[data-idx="' + rn.getAttribute('data-i') + '"]')); return; }
  var tb = t.closest('#typeNav .segBtn');
  if (tb) { var ty = tb.getAttribute('data-type'); if (ty !== F.type) { F.type = ty; F.period = null; F.combo = 'all'; refresh({ curtain: true }); } return; }
  var sb = t.closest('#streamNav .segBtn');
  if (sb) { var st = sb.getAttribute('data-stream'); if (st !== F.stream) { F.stream = st; F.combo = 'all'; refresh({ curtain: true, keepPeriod: true }); } return; }
  var wb = t.closest('.weekBtn');
  if (wb) { var id = wb.getAttribute('data-period'); if (id !== F.period) { F.period = id; refresh({ curtain: true }); } return; }
  var cb = t.closest('.comboBtn');
  if (cb) {
    var c = cb.getAttribute('data-combo');
    if (c !== F.combo) { F.combo = c; refresh({ after: function () { goTo($('#roster'), true); } }); }
    return;
  }
  if (t.closest('#hdrHome')) { ev.preventDefault(); window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); return; }
  var lk = t.closest('[data-link]');
  if (lk) {
    var url = location.origin + urlFor('#r-' + lk.getAttribute('data-link')).replace(/[?&]drafts=1/, '');
    copyText(url).then(function () { toast('Сілтеме көшірілді'); }, function () { prompt('Сілтеме:', url); });
    return;
  }
  var ed = t.closest('[data-edit]');
  if (ed && window.__openAdmin) { window.__openAdmin({ report: ed.getAttribute('data-edit') }); return; }
  if (t.closest('[data-open-admin]') && window.__openAdmin) { window.__openAdmin({}); return; }
  if (t.closest('#userBtn')) { userMenu(); return; }
});
document.addEventListener('input', function (ev) { if (ev.target && ev.target.id === 'pickSearch') filterPicker(ev.target.value); });
document.addEventListener('keydown', function (ev) {
  if (ev.key === 'Escape' && !$('#picker').hidden) { closePicker(); $('#subjPick').focus(); }
  if (ev.key === 'Enter' && ev.target && ev.target.id === 'pickSearch') { var first = $('#pickBody .pickItem:not([hidden])[data-q]'); if (first) first.click(); }
});
document.addEventListener('submit', function (ev) {
  if (ev.target && ev.target.id === 'loginForm') {
    ev.preventDefault();
    var f = ev.target, err = $('#loginErr');
    err.textContent = '';
    var b = $('button', f); b.disabled = true;
    api('POST', '/api/session', { username: f.username.value, password: f.password.value }).then(function (r) {
      S.user = r.user; start();
    }).catch(function (e) { err.textContent = e.message; b.disabled = false; });
  }
});
window.addEventListener('popstate', function () { readURL(); refresh({}); });

function userMenu() {
  if (!S.user) { S.view = null; renderActs(); var u = $('#loginForm input'); if (u) u.focus(); jumpTop(); return; }
  var m = $('#modal');
  m.innerHTML = '<div class="modalBox"><h4>' + esc(S.user.displayName) + '</h4><p>Рөлі: ' + ROLE_NAME[S.user.role] + ' · логин: ' + esc(S.user.username) + '</p>' +
    '<div class="aRow">' + (canEdit() ? '<button class="aBtn primary" type="button" data-m="admin">Әкімші бөлімі</button>' + (S.drafts ? '<button class="aBtn" type="button" data-m="nodrafts">Тек жарияланғанын көру</button>' : '<button class="aBtn" type="button" data-m="drafts">Жобаларды да көрсету</button>') : '') +
    '<button class="aBtn" type="button" data-m="logout">Шығу</button><button class="aBtn ghost" type="button" data-m="close">Жабу</button></div></div>';
  m.hidden = false;
  m.onclick = function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-m]');
    if (!b && ev.target !== m) return;
    var a = b ? b.getAttribute('data-m') : 'close';
    m.hidden = true; m.onclick = null;
    if (a === 'admin' && window.__openAdmin) window.__openAdmin({});
    if (a === 'drafts' || a === 'nodrafts') { S.drafts = a === 'drafts'; refresh({}); }
    if (a === 'logout') api('DELETE', '/api/session').then(function () { S.user = null; S.view = null; S.drafts = false; writeURL(''); renderAll(); });
  };
}

/* ================= start ================= */
function start() {
  readURL();
  return api('GET', '/api/session').then(function (s) {
    S.session = s; S.user = s.user;
    if (!s.dbOk) { renderAll(); return; }
    if (!S.user && !s.publicView) { renderAll(); return; }
    return api('GET', '/api/catalog').then(function (c) {
      S.catalog = c;
      return loadView({ keepHash: true });
    }).then(function () {
      renderAll();
      scrollToHash();
      if (S.isAdminPath && canEdit() && window.__openAdmin) window.__openAdmin({});
    });
  }).catch(function (e) { toast(e.message, 'bad'); renderAll(); });
}
window.__sp = { S: S, F: F, refresh: refresh, renderAll: renderAll, api: api, toast: toast, esc: esc, richText: richText, inline: inline, subjOf: subjOf, comboOf: comboOf, streamOf: streamOf, cat: cat, fmtDate: fmtDate, writeURL: writeURL, ROLE_NAME: ROLE_NAME, TYPES: TYPES, canEdit: canEdit };
rainStart();
start();
