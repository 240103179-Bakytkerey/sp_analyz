/* ================= Әкімші бөлімі =================
   Ментор: есеп жасау/өңдеу/жариялау, импорт. Әкімші: + анықтамалық, пайдаланушылар, баптау, тарих.
   Барлық рұқсат серверде тексеріледі — мұнда тек ыңғайлы интерфейс. */
var AD = { open: false, tab: 'reports', reports: [], rf: { type: '', stream: '', subject: '', status: '' }, ed: null, catKind: 'teachers', users: [], audit: [], imp: { ls: null, json: null, st: null, tg: null, status: null } };
var adminEl = $('#admin');
function isAdmin() { return S.user && S.user.role === 'admin'; }
function deep(o) { return JSON.parse(JSON.stringify(o == null ? null : o)); }
function getPath(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
function setPath(o, p, v) {
  var ks = p.split('.'), cur = o;
  for (var i = 0; i < ks.length - 1; i++) { var k = ks[i]; if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; cur = cur[k]; }
  cur[ks[ks.length - 1]] = v;
}
function v(x) { return x == null ? '' : String(x); }
function opt(val, label, sel) { return '<option value="' + esc(val) + '"' + (String(sel) === String(val) ? ' selected' : '') + '>' + esc(label) + '</option>'; }
function inp(path, val, o) {
  o = o || {};
  return '<label class="aField' + (o.cls ? ' ' + o.cls : '') + '"><span>' + esc(o.label || '') + '</span><input class="aIn' + (o.num ? ' num' : '') + '" data-path="' + esc(path) + '" value="' + esc(v(val)) + '"' + (o.num ? ' inputmode="decimal"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.type ? ' type="' + o.type + '"' : '') + (o.ro ? ' readonly' : '') + '></label>';
}
function ta(path, val, o) {
  o = o || {};
  return '<label class="aField wide"><span>' + esc(o.label || '') + '</span><textarea class="aTa" data-path="' + esc(path) + '"' + (o.lines ? ' data-lines' : '') + ' rows="' + (o.rows || 3) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + '>' + esc(o.lines ? (val || []).join('\n') : v(val)) + '</textarea>' + (o.hint ? '<small class="aSrc">' + esc(o.hint) + '</small>' : '') + '</label>';
}
function sel(path, val, options, o) {
  o = o || {};
  return '<label class="aField' + (o.cls ? ' ' + o.cls : '') + '"><span>' + esc(o.label || '') + '</span><select class="aSel" ' + (path ? 'data-path="' + esc(path) + '"' : '') + (o.id ? ' id="' + o.id + '"' : '') + (o.name ? ' name="' + o.name + '"' : '') + '>' + options.map(function (x) { return opt(x[0], x[1], val); }).join('') + '</select></label>';
}
function streamOpts(all) { return (all ? [['', all]] : []).concat(cat().streams.map(function (s) { return [s.id, s.name]; })); }
function subjOpts(all) { return (all ? [['', all]] : []).concat(cat().subjects.map(function (s) { return [s.id, s.name]; })); }
function teacherOpts() { return [['', '— таңдаңыз —']].concat(cat().teachers.map(function (t) { return [t.id, t.full_name + (t.active === false ? ' (белсенді емес)' : '')]; })); }
function periodLabel(id) { var p = findBy(cat().periods || [], id); return p ? p.label : '—'; }
function teacherName(id) { var t = findBy(cat().teachers, id); return t ? t.full_name : '—'; }
function statusChip(r) {
  if (r.status === 'published') return r.dirty ? '<span class="chip warnChip">Сайтта · жарияланбаған өзгеріс бар</span>' : '<span class="chip on">Сайтта · ' + r.published_rev + '-нұсқа</span>';
  return '<span class="chip draft">Жоба</span>';
}
function confirmBox(title, text, buttons) {
  return new Promise(function (resolve) {
    var m = $('#modal');
    m.innerHTML = '<div class="modalBox wide"><h4>' + esc(title) + '</h4><p>' + esc(text) + '</p><div class="aRow">' + buttons.map(function (b, i) { return '<button class="aBtn ' + (b[2] || '') + '" type="button" data-i="' + i + '">' + esc(b[1]) + '</button>'; }).join('') + '</div></div>';
    m.hidden = false;
    m.onclick = function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-i]');
      if (!b && ev.target !== m) return;
      m.hidden = true; m.onclick = null;
      resolve(b ? buttons[+b.getAttribute('data-i')][0] : null);
    };
  });
}
function errText(e) { return e.body && e.body.details ? e.message : e.message; }

/** Бір әрекет аяқталғанша қайта басуды елемеу (екі рет басу → екі сұраныс болмасын). Батырмалар уақытша өшіріледі. */
var busy = {};
function guarded(key, fn) {
  if (busy[key]) return;
  busy[key] = true;
  var btns = $$('.aBar .aBtn, [data-imp], [data-cat-save], [data-a="user-save"]', adminEl);
  btns.forEach(function (x) { x.disabled = true; });
  var done = function () { busy[key] = false; $$('.aBar .aBtn, [data-imp], [data-cat-save], [data-a="user-save"]', adminEl).forEach(function (x) { x.disabled = false; }); };
  var p;
  try { p = fn(); } catch (e) { done(); throw e; }
  Promise.resolve(p).then(done, done);
}
window.__adminDirty = function () { return !!(AD.ed && AD.ed.dirty); };
window.addEventListener('beforeunload', function (ev) { if (AD.ed && AD.ed.dirty) { ev.preventDefault(); ev.returnValue = ''; } });

window.__openAdmin = function (opts) {
  if (!canEdit()) { toast('Әкімші бөліміне ментор немесе әкімші аккаунтымен кіріңіз.', 'bad'); return; }
  AD.open = true;
  adminEl.hidden = false;
  document.documentElement.classList.add('adminOn');
  try { history.replaceState(null, '', '/admin' + location.search); } catch (e) {}
  S.isAdminPath = true;
  reloadCatalog().then(function () {
    if (opts && opts.report) return openReport(opts.report);
    if (opts && opts.draft) { AD.tab = 'reports'; return newReport(opts.draft.type, opts.draft); }
    return loadReports();
  }).then(renderAdmin);
};
function closeAdmin() {
  var go = function () {
    AD.open = false; AD.ed = null;
    adminEl.hidden = true; adminEl.innerHTML = '';
    document.documentElement.classList.remove('adminOn');
    S.isAdminPath = false;
    writeURL('');
    refresh({});
  };
  if (AD.ed && AD.ed.dirty) confirmBox('Сақталмаған өзгеріс бар', 'Есепте сақталмаған өзгеріс бар. Шықсаңыз, ол жоғалады.', [['stay', 'Қалу', 'primary'], ['go', 'Сақтамай шығу', 'danger']]).then(function (a) { if (a === 'go') go(); });
  else go();
}
function reloadCatalog() { return api('GET', '/api/catalog').then(function (c) { S.catalog = c; }); }
function loadReports() {
  var f = AD.rf, q = [];
  ['type', 'stream', 'subject', 'status'].forEach(function (k) { if (f[k]) q.push(k + '=' + encodeURIComponent(f[k])); });
  return api('GET', '/api/reports?' + q.join('&')).then(function (r) { AD.reports = r.reports; }).catch(function (e) { toast(e.message, 'bad'); });
}

var TABS = [['reports', 'Есептер'], ['import', 'Импорт'], ['catalog', 'Анықтамалық', 1], ['users', 'Пайдаланушылар', 1], ['settings', 'Импорт баптауы', 1], ['history', 'Тарих', 1]];
function renderAdmin() {
  if (!AD.open) return;
  var keep = adminEl.scrollTop;
  var dirty = AD.ed && AD.ed.dirty;
  adminEl.innerHTML = '<div class="aTop"><h2 class="aTitle">' + logoSVG('', 58, 18) + ' SMART PRO · ' + (isAdmin() ? 'Әкімші' : 'Ментор') + ' бөлімі</h2>' +
    '<span class="aStatus"' + (dirty ? ' data-dirty' : '') + '><i></i>' + esc(S.user.displayName) + (dirty ? ' · сақталмаған өзгеріс бар' : '') + '</span>' +
    '<div class="aActions"><button class="aBtn" type="button" data-a="site">← Сайтқа оралу</button></div></div>' +
    '<div class="aTabs" role="tablist">' + TABS.filter(function (t) { return !t[2] || isAdmin(); }).map(function (t) {
      return '<button class="aTab" type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (AD.tab === t[0]) + '">' + t[1] + '</button>';
    }).join('') + '</div><div class="aBody" id="aBody">' + tabBody() + '</div>';
  adminEl.scrollTop = keep;
  typesetMath(adminEl);
  renderHeader();
}
function tabBody() {
  if (AD.tab === 'reports') return AD.ed ? editorHTML() : reportsHTML();
  if (AD.tab === 'import') return importHTML();
  if (AD.tab === 'catalog') return catalogHTML();
  if (AD.tab === 'users') return usersHTML();
  if (AD.tab === 'settings') return settingsHTML();
  if (AD.tab === 'history') return historyHTML();
  return '';
}

/* ---------------- reports list ---------------- */
function reportsHTML() {
  var f = AD.rf;
  var rows = AD.reports.map(function (r) {
    var s = subjOf(r.subject_id), st = streamOf(r.stream_id), c = r.scope !== 'all' ? comboOf(r.scope) : null;
    return '<tr><td><b>' + TYPES[r.type].short + '</b>' + (r.demo ? ' <span class="chip">демо</span>' : '') + '</td><td>' + esc(st ? st.short : r.stream_id) + '</td><td>' + esc(s ? s.name : r.type === 'bt' ? (c ? c.code : 'Барлығы') : '—') + '</td><td>' + esc(periodLabel(r.period_id)) + '</td>' +
      '<td>' + esc(r.teacher_id ? teacherName(r.teacher_id) : '—') + '</td><td>' + statusChip(r) + '</td><td><small>' + esc(r.updated_by || '') + '<br>' + esc(fmtDate(r.updated_at)) + '</small></td>' +
      '<td><button class="aBtn" type="button" data-open="' + esc(r.id) + '">Ашу</button></td></tr>';
  }).join('');
  return '<div class="aCard"><div class="aRow">' +
    '<button class="aBtn primary" type="button" data-new="ls">+ ЛС есебі</button><button class="aBtn primary" type="button" data-new="st">+ СТ есебі</button><button class="aBtn primary" type="button" data-new="bt">+ БТ есебі</button>' +
    '<button class="aBtn" type="button" data-tab="import">Telegram мәтінінен / импорт</button></div></div>' +
    '<div class="aCard"><h3>Есептер</h3><div class="aRow filterRow">' +
    sel('', f.type, [['', 'Барлық түр'], ['ls', 'ЛС'], ['st', 'СТ'], ['bt', 'БТ']], { label: 'Түрі', name: 'rf-type' }) +
    sel('', f.stream, streamOpts('Барлық ағым'), { label: 'Ағым', name: 'rf-stream' }) +
    sel('', f.subject, subjOpts('Барлық пән'), { label: 'Пән', name: 'rf-subject' }) +
    sel('', f.status, [['', 'Кез келген'], ['draft', 'Жоба'], ['published', 'Сайтта']], { label: 'Күйі', name: 'rf-status' }) + '</div>' +
    (rows ? '<div class="aTableWrap"><table class="aTable"><thead><tr><th>Түрі</th><th>Ағым</th><th>Пән / комб.</th><th>Кезең</th><th>Мұғалім</th><th>Күйі</th><th>Өзгерткен</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' :
      '<div class="aEmpty">Сүзгіге сай есеп жоқ. Жоғарыдан жаңа есеп жасаңыз немесе Импорт бөлімін қолданыңыз.</div>') + '</div>';
}

/* ---------------- editor ---------------- */
function emptyData(type) {
  if (type === 'ls') return { lessons: [blankLesson()], difficulties: [], mentor: { summary: '', nextSteps: '' } };
  if (type === 'st') return { overallSource: 'auto', overall: {}, combos: [], retake: {}, hardTasks: [], topics: [], mentor: { summary: '', combosAnalysis: '', recommendation: '' } };
  return { participants: null, comparable: true, overall: {}, top3: [], subjects: [], hardTopics: [], analysis: '', actionPlan: '' };
}
function blankLesson() { return { source: 'manual', date: '', topic: '', combos: [], present: '', total: '', attendancePct: '', liked: '', avg: '', disliked: '', understanding: {}, split: {} }; }
function newReport(type, prefill) {
  prefill = prefill || {};
  var data = emptyData(type);
  if (prefill.data) Object.keys(prefill.data).forEach(function (k) { data[k] = prefill.data[k]; });
  AD.ed = {
    isNew: true, type: type, dirty: !!prefill.data, lowConfidence: prefill.lowConfidence || [],
    meta: { stream_id: prefill.stream_id || (F.stream !== 'all' ? F.stream : ''), subject_id: prefill.subject_id || (F.subject !== 'all' ? F.subject : ''), month: prefill.period ? prefill.period.month : '', week: prefill.period ? prefill.period.week : '', test_date: '', label: '', cohort: '', scope: 'all', teacher_id: prefill.teacher_id || '' },
    data: data, report: null, warnings: [], errors: []
  };
  AD.tab = 'reports';
  renderAdmin();
}
function openReport(id) {
  return api('GET', '/api/reports?id=' + encodeURIComponent(id)).then(function (r) {
    setEditor(r.report);
    AD.tab = 'reports';
    renderAdmin();
  }).catch(function (e) { toast(e.message, 'bad'); });
}
function setEditor(rep) {
  AD.ed = { isNew: false, type: rep.type, dirty: false, report: rep, data: deep(rep.data) || emptyData(rep.type), meta: { teacher_id: rep.teacher_id || '' }, warnings: [], errors: [] };
}
function suggestedTeacher() {
  var m = AD.ed.meta;
  if (!m.stream_id || !m.subject_id) return null;
  var list = cat().assignments.filter(function (a) { return a.stream_id === m.stream_id && a.subject_id === m.subject_id; });
  var cur = list.filter(function (a) { return !a.valid_to; })[0] || list[0];
  return cur ? cur.teacher_id : null;
}
function editorHTML() {
  var ed = AD.ed, r = ed.report, type = ed.type, T = TYPES[type];
  var head;
  if (ed.isNew) {
    var m = ed.meta, sug = suggestedTeacher();
    head = '<div class="aRow">' + sel('meta.stream_id', m.stream_id, [['', '— ағым —']].concat(streamOpts()), { label: 'Ағым' }) +
      (type !== 'bt' ? sel('meta.subject_id', m.subject_id, [['', '— пән —']].concat(subjOpts()), { label: 'Пән' }) +
        inp('meta.month', m.month, { label: 'Оқу айы', num: true }) + inp('meta.week', m.week, { label: 'Апта', num: true }) +
        sel('meta.teacher_id', m.teacher_id || sug || '', teacherOpts(), { label: 'Мұғалім' + (sug ? ' (тағайындаудан)' : '') })
        : inp('meta.test_date', m.test_date, { label: 'Тест күні', type: 'date' }) + inp('meta.label', m.label, { label: 'Атауы (міндетті емес)', ph: 'мысалы: Қараша БТ' }) +
        inp('meta.cohort', m.cohort, { label: 'Когорта/кезең', ph: 'міндетті емес' }) + sel('meta.scope', m.scope, [['all', 'Барлық комбинация']].concat(cat().combinations.map(function (c) { return [c.id, c.code + ' · ' + c.name]; })), { label: 'Комбинация' })) + '</div>' +
      (type !== 'bt' && m.stream_id && m.subject_id && !sug ? '<p class="aHint warnText">Бұл ағым мен пәнге тағайындау жоқ — мұғалімді қолмен таңдаңыз немесе Анықтамалықта тағайындау қосыңыз.</p>' : '');
  } else {
    var s = subjOf(r.subject_id), st = streamOf(r.stream_id);
    head = '<p class="aHint">' + esc(st ? st.name : '') + ' · ' + esc(type === 'bt' ? (r.scope === 'all' ? 'Барлық комбинация' : (comboOf(r.scope) || {}).code) : s ? s.name : '') + ' · ' + esc(periodLabel(r.period_id)) +
      ' · ' + r.version + '-нұсқа · соңғы өзгерткен ' + esc(r.updated_by || '—') + ', ' + esc(fmtDate(r.updated_at)) + ' · жасаған ' + esc(r.created_by || '—') + '</p>' +
      (type !== 'bt' ? '<div class="aRow">' + sel('meta.teacher_id', ed.meta.teacher_id, teacherOpts(), { label: 'Мұғалім (осы есепте сақталады; тағайындау өзгерсе де ескі есеп өзгермейді)', cls: 'grow' }) + '</div>' : '');
  }
  var lowc = ed.lowConfidence && ed.lowConfidence.length ? '<div class="aCard warnCard"><b>Telegram мәтінінен алдын ала толтырылды.</b> Барлық мәнді тексеріңіз. Сенімсіз танылғандар: ' + ed.lowConfidence.map(esc).join(', ') + '. Ештеңе сақталған жоқ.</div>' : '';
  var msgs = (ed.errors.length ? '<div class="aCard errCard"><b>Сақталмады:</b><ul>' + ed.errors.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '') +
    (ed.warnings.length ? '<div class="aCard warnCard"><b>Ескерту:</b><ul>' + ed.warnings.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '');
  var form = type === 'ls' ? lsForm(ed.data) : type === 'st' ? stForm(ed.data) : btForm(ed.data);
  var actions = '<div class="aBar"><span class="aStatus"' + (ed.dirty ? ' data-dirty' : '') + '><i></i>' + (ed.dirty ? 'Сақталмаған өзгеріс бар' : ed.isNew ? 'Жаңа есеп' : 'Сақталған') + '</span>' +
    '<button class="aBtn primary" type="button" data-a="save">Сақтау (жоба)</button>' +
    '<button class="aBtn primary" type="button" data-a="publish">Сақтау және жариялау</button>' +
    (!ed.isNew ? '<button class="aBtn" type="button" data-a="preview">Алдын ала қарау</button>' : '') +
    (r && r.status === 'published' ? '<button class="aBtn" type="button" data-a="unpublish">Жариялаудан алу</button>' : '') +
    (!ed.isNew ? '<button class="aBtn" type="button" data-a="revisions">Нұсқалар</button>' : '') +
    (!ed.isNew && isAdmin() && r.status !== 'published' ? '<button class="aBtn danger" type="button" data-a="delete">Өшіру</button>' : '') + '</div>';
  return '<div class="aCard"><div class="aRow"><button class="aBtn ghost" type="button" data-a="back">← Есептер тізімі</button><h3 class="edTitle">' + T.short + ' · ' + esc(T.name) + (ed.isNew ? ' — жаңа есеп' : '') + '</h3>' + (r ? statusChip(r) : '') + '</div>' + head + '</div>' +
    lowc + msgs + form + actions;
}
/** Есептің пәні (жаңа есепте — таңдалғаны). */
function edSubject() { return AD.ed ? (AD.ed.isNew ? AD.ed.meta.subject_id : AD.ed.report && AD.ed.report.subject_id) : null; }
/** Пәнге қатысты комбинациялар (комбинацияның «пәндер» тізімі бойынша). Ортақ пәндерге (тарих, мат. сауаттылық) — бәрі. */
function combosFor(subjectId, keep) {
  var all = cat().combinations.filter(function (c) { return c.active !== false || (keep || []).indexOf(c.id) >= 0; });
  if (!subjectId || AD.allCombos) return all;
  var rel = all.filter(function (c) { return (c.subjects || []).indexOf(subjectId) >= 0 || (keep || []).indexOf(c.id) >= 0; });
  return rel.length ? rel : all;
}
function comboToggleBtn() {
  return '<button class="aBtn ghost" type="button" data-a="all-combos">' + (AD.allCombos ? 'Тек пәнге қатыстыларын көрсету' : 'Барлық комбинация') + '</button>';
}
/** Клиенттегі авто-тану (lib/merge-ls.js detectCombo-мен бірдей ереже). */
function normCode(s) { return String(s == null ? '' : s).toUpperCase().replace(/Ё/g, 'Е').replace(/[^0-9A-ZА-ЯӘҒҚҢӨҰҮҺІ]+/g, ''); }
function detectComboClient(text) {
  var t = normCode(text), best = null, len = 0;
  cat().combinations.forEach(function (c) { [c.code].concat(c.aliases || []).forEach(function (k) { var n = normCode(k); if (n.length >= 3 && n.length > len && t.indexOf(n) >= 0) { best = c; len = n.length; } }); });
  return best;
}
function comboChecks(path, list) {
  return '<div class="aChecks">' + combosFor(edSubject(), list).map(function (c) {
    return '<label class="aCheck"><input type="checkbox" data-combo-toggle="' + esc(path) + '" value="' + esc(c.id) + '"' + ((list || []).indexOf(c.id) >= 0 ? ' checked' : '') + '>' + esc(c.code) + '</label>';
  }).join('') + (cat().combinations.length ? '' : '<span class="aSrc">Комбинация анықтамалығы бос</span>') + '</div>';
}
function lsForm(d) {
  var lessons = d.lessons || [];
  var html = '<div class="aCard"><h3>Сабақтар <small>' + lessons.length + '</small></h3><p class="aHint">Әр сабақ бір рет саналады. Бір сабаққа бірнеше комбинация қатысса және сандар бөлінбесе — «ортақ сабақ» болады: оның сандары тек «Барлығы» көрінісінде. Комбинация бойынша жеке нәтиже үшін «Комбинацияларға бөлу» өрістерін толтырыңыз. Бос өріс — дерек жоқ, 0 — нөл.</p>' +
    lessons.map(function (l, i) {
      var p = 'data.lessons.' + i;
      var shared = (l.combos || []).length > 1;
      return '<div class="aLesson' + (l.excluded ? ' excluded' : '') + '"><div class="aRow"><b class="aNum">' + (i + 1) + '</b>' +
        (l.source && l.source !== 'manual' ? '<span class="chip">' + esc(l.source === 'sapaline' ? 'SapaLine' : 'JSON') + (l.sourceId ? ' #' + esc(l.sourceId) : '') + '</span>' : '<span class="chip">қолмен</span>') +
        inp(p + '.date', l.date, { label: 'Күні', ph: 'ЖЖЖЖ-АА-КК' }) + inp(p + '.topic', l.topic, { label: 'Тақырып', cls: 'grow' }) + (l.agym ? '<span class="aSrc">SapaLine ағымы: ' + esc(l.agym) + '</span>' : '') + '</div>' +
        '<div class="aRow"><span class="aField"><span>Комбинация(лар) ' + (i === 0 ? comboToggleBtn() : '') + '</span>' + comboChecks(p + '.combos', l.combos) + '</span>' +
        inp(p + '.present', l.present, { label: 'Қатысқан', num: true }) + inp(p + '.total', l.total, { label: 'Жалпы', num: true }) + inp(p + '.attendancePct', l.attendancePct, { label: 'немесе қатысым %', num: true }) +
        inp(p + '.liked', l.liked, { label: 'Ұнады', num: true }) + inp(p + '.avg', l.avg, { label: 'Орташа', num: true }) + inp(p + '.disliked', l.disliked, { label: 'Ұнамады', num: true }) + '</div>' +
        '<div class="aRow"><span class="aField"><span>Түсіну деңгейі (жауап саны)</span><span class="aRow tight">' + UNDERSTANDING.map(function (c) { return inp(p + '.understanding.' + c.key, (l.understanding || {})[c.key], { label: c.label, num: true }); }).join('') + '</span></span></div>' +
        (shared ? '<details class="aSplit"' + (Object.keys(l.split || {}).length ? ' open' : '') + '><summary>Комбинацияларға бөлу (міндетті емес)</summary>' + l.combos.map(function (c) {
          var sp = (l.split || {})[c] || {}, q = p + '.split.' + c, cc = comboOf(c);
          return '<div class="aRow"><b class="aNum">' + esc(cc ? cc.code : c) + '</b>' + ['present', 'total', 'liked', 'avg', 'disliked'].map(function (k) { return inp(q + '.' + k, sp[k], { label: { present: 'Қатысқан', total: 'Жалпы', liked: 'Ұнады', avg: 'Орташа', disliked: 'Ұнамады' }[k], num: true }); }).join('') + '</div>';
        }).join('') + '<button class="aBtn ghost" type="button" data-clear-split="' + i + '">Бөліністі тазалау</button></details>' : '') +
        '<div class="aRow"><label class="aCheck"><input type="checkbox" data-bool="' + p + '.excluded"' + (l.excluded ? ' checked' : '') + '>Есепке кірмейді</label><button class="aBtn ghost danger" type="button" data-del="lessons.' + i + '">Сабақты өшіру</button></div></div>';
    }).join('') + '<button class="aBtn" type="button" data-add="lessons">+ Сабақ қосу</button></div>' +
    '<div class="aCard liveSum" id="liveSum">' + lsSummary(d) + '</div>' +
    '<div class="aCard"><h3>Оқушылардың қиындықтары / пікірлері</h3><p class="aHint">Жалпы шолуда оқушының аты көрсетілмейді; аты тек «Толық есеп» ішінде шығады.</p>' +
    (d.difficulties || []).map(function (x, i) {
      var p = 'data.difficulties.' + i;
      return '<div class="aRow">' + inp(p + '.text', x.text, { label: 'Мәтін', cls: 'grow' }) + inp(p + '.count', x.count, { label: 'Оқушы саны', num: true }) + inp(p + '.student', x.student, { label: 'Оқушы аты (тек толық есепте)' }) + '<button class="aBtn ghost danger" type="button" data-del="difficulties.' + i + '">✕</button></div>';
    }).join('') + '<button class="aBtn" type="button" data-add="difficulties">+ Қосу</button></div>' +
    '<div class="aCard"><h3>Ментор</h3>' + ta('data.mentor.summary', (d.mentor || {}).summary, { label: 'Қысқаша қорытынды', rows: 4 }) + ta('data.mentor.nextSteps', (d.mentor || {}).nextSteps, { label: 'Мұғалімге келесі қадам / ұсыныс', rows: 4, hint: 'Әр жол — абзац; «- » — тармақ; **қалың**; H_2O, x^2.' }) + '</div>';
  return html;
}
function lsSummary(d) {
  var a = lsAggregate(d.lessons, null);
  var combos = [];
  (d.lessons || []).forEach(function (l) { (l.combos || []).forEach(function (c) { if (combos.indexOf(c) < 0) combos.push(c); }); });
  var row = function (name, x) {
    return '<tr><th>' + esc(name) + '</th><td>' + fmtPct(x.like.pct) + '<small> ' + (isNum(x.like.responses) ? x.like.responses + ' жауап' : '') + '</small></td><td>' + fmtPct(x.attendance.pct) + '<small> ' + (x.attendance.mode === 'weighted' || x.attendance.mode === 'partial' ? x.attendance.present + '/' + x.attendance.total : x.attendance.mode === 'average' ? 'орташа' : '') + '</small></td><td>' + (x.shared.length ? x.shared.length + ' ортақ' : '') + '</td></tr>';
  };
  return '<h3>Есептеу (алдын ала)</h3><table class="aTable"><thead><tr><th></th><th>Ұнату</th><th>Қатысым</th><th></th></tr></thead><tbody>' + row('Барлығы', a) +
    combos.map(function (c) { var x = lsAggregate(d.lessons, c), cc = comboOf(c); return row(cc ? cc.code : c, x); }).join('') + '</tbody></table>' +
    (a.attendance.overflow ? '<p class="aHint warnText">Қатысым 100%-дан асты — басқа ағымнан қосылғандар болуы мүмкін; сан сол күйінде сақталады.</p>' : '') +
    '<p class="aSrc">Ұнату = Ұнады ÷ (Ұнады + Орташа + Ұнамады). Қатысым = Σ қатысқан ÷ Σ жалпы (сабақтар бойынша, бірегей оқушылар емес).</p>';
}
function stForm(d) {
  var imp = d.imported;
  var impHTML = imp ? '<div class="aCard"><h3>Платформадан алынған</h3><p class="aHint">' + esc(imp.lessonName || '') + ' · ' + fmtNum(imp.score) + '/' + fmtNum(imp.max) + ' балл · ' + fmtInt(imp.submitted) + '/' + fmtInt(imp.total) + ' тапсырды · ' + esc(fmtDate(imp.importedAt)) + '</p>' +
    (imp.groups && imp.groups.length ? '<div class="aTableWrap"><table class="aTable"><thead><tr><th>Топ</th><th>Балл</th><th>Тапсырды</th></tr></thead><tbody>' + imp.groups.map(function (g) { return '<tr><td>' + esc(g.name) + '</td><td>' + fmtNum(g.score) + '</td><td>' + g.submitted + '/' + g.total + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') +
    '<p class="aSrc">Бұл сандар тек импорт арқылы жаңарады. Ментордың мәтіндері, қайта тапсыру дерегі мен түсіндірмелер қайта импортта сақталады.</p></div>' : '';
  var o = d.overall || {}, rt = d.retake || {};
  return impHTML + '<div class="aCard"><h3>Жалпы нәтиже</h3><div class="aRow">' +
    sel('data.overallSource', d.overallSource || 'auto', [['auto', 'Автоматты: платформа → қолмен → салмақталған'], ['manual', 'Қолмен енгізілген жалпы мән'], ['weighted', 'Комбинациялардан салмақталған']], { label: 'Жалпы баллдың көзі', cls: 'grow' }) +
    inp('data.overall.score', o.score, { label: 'Ортақ балл', num: true }) + inp('data.overall.max', o.max, { label: 'Максимал балл', num: true }) + inp('data.overall.submitted', o.submitted, { label: 'Тапсырғандар', num: true }) + inp('data.overall.total', o.total, { label: 'Барлық оқушы', num: true }) + '</div>' +
    '<div class="aRow">' + inp('data.retake.retakeCount', rt.retakeCount, { label: 'Қайта тапсыратындар (жалпы)', num: true }) + inp('data.retake.retakeBase', rt.retakeBase, { label: 'Осы көрсеткіштің оқушы саны', num: true }) + inp('data.retake.retakePct', rt.retakePct, { label: 'немесе дереккөздегі %', num: true }) + '</div>' +
    '<p class="aSrc">Қайта тапсыру баллдан ойдан шек қойып есептелмейді: нақты санды не дереккөз пайызын енгізіңіз. Бөлгіш белгісіз болса, ойдан табылмайды.</p></div>' +
    '<div class="aCard"><h3>Комбинациялар бойынша</h3>' + (d.combos || []).map(function (c, i) {
      var p = 'data.combos.' + i;
      return '<div class="aRow">' + sel(p + '.comboId', c.comboId, [['', '— комбинация —']].concat(combosFor(edSubject(), [c.comboId]).map(function (x) { return [x.id, x.code]; })), { label: 'Комбинация' }) +
        inp(p + '.score', c.score, { label: 'Ортақ балл', num: true }) + inp(p + '.max', c.max, { label: 'Макс.', num: true }) + inp(p + '.submitted', c.submitted, { label: 'Тапсырды', num: true }) +
        inp(p + '.retakeCount', c.retakeCount, { label: 'Қайта тапсыру саны', num: true }) + inp(p + '.retakeBase', c.retakeBase, { label: 'Оқушы саны', num: true }) + inp(p + '.retakePct', c.retakePct, { label: 'немесе %', num: true }) +
        (c.fromPlatform ? '<span class="chip">балл платформадан</span>' : '') + '<button class="aBtn ghost danger" type="button" data-del="combos.' + i + '">✕</button></div>' +
        ta(p + '.note', c.note, { label: 'Осы комбинация бойынша талдау', rows: 2 });
    }).join('') + '<div class="aRow"><button class="aBtn" type="button" data-add="combos">+ Комбинация</button>' + comboToggleBtn() + '</div></div>' +
    '<div class="aCard liveSum" id="liveSum">' + stSummary(d) + '</div>' +
    '<div class="aCard"><h3>Қиын тапсырмалар <small>' + (d.hardTasks || []).length + '</small></h3><p class="aHint">Саны шектелмейді. Мәтінде: жаңа жол — абзац, H_2SO_4, x^2, x^{n+1}, **қалың**. Платформадан келген формулалар (MathML) сақталады.</p>' +
    (d.hardTasks || []).map(function (t, i) {
      var p = 'data.hardTasks.' + i;
      return '<div class="aLesson"><div class="aRow"><b class="aNum">' + (i + 1) + '</b>' + inp(p + '.variant', t.variant, { label: 'Нұсқа', num: true }) + inp(p + '.q', t.q, { label: '№', num: true }) + inp(p + '.wrongPct', t.wrongPct, { label: 'Қате %', num: true }) + inp(p + '.topic', t.topic, { label: 'Тақырып', cls: 'grow' }) +
        (t.fromPlatform ? '<span class="chip">платформа</span>' : '') + '<button class="aBtn ghost" type="button" data-move="' + i + ':-1">↑</button><button class="aBtn ghost" type="button" data-move="' + i + ':1">↓</button><button class="aBtn ghost danger" type="button" data-del="hardTasks.' + i + '">✕</button></div>' +
        inp(p + '.title', t.title, { label: 'Қысқа атауы (міндетті емес)', cls: 'wide' }) +
        (t.html ? '<div class="aField wide"><span>Платформадағы мәтін (формуламен)</span><div class="aPreview rich">' + t.html + '</div><button class="aBtn ghost" type="button" data-drop-html="' + i + '">Формуласыз мәтінмен ауыстыру</button></div>' : ta(p + '.text', t.text, { label: 'Есеп мәтіні', rows: 4 })) +
        ta(p + '.images', t.images, { label: 'Сурет сілтемелері (әр жолға біреу)', rows: 1, lines: true }) +
        (t.options && t.options.length || t.pairs && t.pairs.length ? '<div class="aField wide"><span>Жауап нұсқалары (платформадан, сайтта көрсетіледі)</span><div class="aPreview">' + optionsHTML(t) + pairsHTML(t) + '</div></div>' : '') +
        ta(p + '.explanation', t.explanation, { label: 'Түсіндірме', rows: 3 }) + '</div>';
    }).join('') + '<button class="aBtn" type="button" data-add="hardTasks">+ Тапсырма</button></div>' +
    '<div class="aCard"><h3>Ментор</h3>' + ta('data.topics', d.topics, { label: 'Тақырыптар (әр жолға біреу)', rows: 2, lines: true }) +
    ta('data.mentor.combosAnalysis', (d.mentor || {}).combosAnalysis, { label: 'Комбинациялар бойынша жалпы талдау', rows: 3 }) +
    ta('data.mentor.summary', (d.mentor || {}).summary, { label: 'Мұғалімге қорытынды', rows: 3 }) +
    ta('data.mentor.recommendation', (d.mentor || {}).recommendation, { label: 'Келесі аптаға ұсыныс', rows: 4 }) + '</div>';
}
function stSummary(d) {
  var o = stOverall(d), r = stRetakeOverall(d);
  var src = { platform: 'платформа', manual: 'қолмен', weighted: 'салмақталған' }[o.source] || (o.reason === 'no_weights' ? 'тапсырған саны белгісіз — есептелмейді' : o.reason === 'max_differs' ? 'максимал балдар әртүрлі' : 'дерек жоқ');
  return '<h3>Есептеу (алдын ала)</h3><p>Жалпы ортақ балл: <b>' + fmtNum(o.score) + (isNum(o.max) ? ' / ' + fmtNum(o.max) : '') + '</b> <small>(' + src + ')</small> · Қайта тапсыру: <b>' + fmtPct(r.pct) + '</b> <small>' + (r.source === 'counts' || r.source === 'weighted' ? r.count + '/' + r.base : r.source === 'reported' ? 'дереккөз %' : r.reason === 'no_base' ? 'бөлгіш белгісіз' : '') + '</small></p>' +
    '<p class="aSrc">Салмақталған: Σ(балл × тапсырған) ÷ Σ тапсырған. Жай орташа жалпы нәтиже ретінде қолданылмайды.</p>';
}
function topRows(path, list) {
  return (list || []).map(function (x, i) {
    var p = path + '.' + i;
    return '<div class="aRow tight"><b class="aNum">' + (i + 1) + '</b>' + inp(p + '.name', x.name, { label: 'Оқушы', cls: 'grow' }) + inp(p + '.score', x.score, { label: 'Балл', num: true }) + '<button class="aBtn ghost danger" type="button" data-del="' + path.replace(/^data\./, '') + '.' + i + '">✕</button></div>';
  }).join('') + '<button class="aBtn ghost" type="button" data-add="' + path.replace(/^data\./, '') + '">+ Оқушы</button>';
}
function btForm(d) {
  var o = d.overall || {};
  return '<div class="aCard"><h3>Жалпы нәтиже</h3><div class="aRow">' + inp('data.participants', d.participants, { label: 'Тест тапсырғандар', num: true }) + inp('data.overall.avg', o.avg, { label: 'Жалпы ортақ балл', num: true }) + inp('data.overall.max', o.max, { label: 'Жалпы максимал балл', num: true }) +
    '<label class="aCheck"><input type="checkbox" data-bool="data.comparable"' + (d.comparable !== false ? ' checked' : '') + '>Алдыңғы БТ-мен салыстыруға жарамды</label></div>' +
    '<h3>Жалпы ТОП-3</h3><p class="aHint">Балл берілсе, тең балл бір орында көрсетіледі; балл жоқ болса — сіз енгізген рет сақталады.</p>' + topRows('data.top3', d.top3) + '</div>' +
    '<div class="aCard"><h3>Пәндер бойынша</h3><p class="aHint">Бір БТ есебі барлық пәнге ортақ: әр мұғалім өз пәнінің нәтижесін көреді. Максимал балды әр пәнге енгізіңіз (барлығына бірдей деп бекітілмейді). «ОС» сияқты қосымша көрсеткіш мұғалімге тағайындалмайды.</p>' +
    (d.subjects || []).map(function (s, i) {
      var p = 'data.subjects.' + i;
      return '<div class="aLesson"><div class="aRow"><b class="aNum">' + (i + 1) + '</b>' + (s.subjectId || !s.label ? sel(p + '.subjectId', s.subjectId || '', [['', '— пән —']].concat(subjOpts()), { label: 'Пән' }) : inp(p + '.label', s.label, { label: 'Қосымша көрсеткіш атауы' })) +
        inp(p + '.avg', s.avg, { label: 'Ортақ балл', num: true }) + inp(p + '.max', s.max, { label: 'Макс.', num: true }) + inp(p + '.participants', s.participants, { label: 'Тапсырды', num: true }) + '<button class="aBtn ghost danger" type="button" data-del="subjects.' + i + '">✕</button></div>' +
        '<p class="aSrc">Пән бойынша ТОП-3</p>' + topRows(p + '.top3', s.top3) +
        ta(p + '.hardTopics', s.hardTopics, { label: 'Ең қиын тақырыптар (әр жолға біреу)', rows: 2, lines: true }) + ta(p + '.recommendation', s.recommendation, { label: 'Мұғалімге пәндік ұсыныс', rows: 2 }) + '</div>';
    }).join('') + '<div class="aRow"><button class="aBtn" type="button" data-add="subjects">+ Пән</button><button class="aBtn" type="button" data-add="subjects-extra">+ Қосымша көрсеткіш (мысалы ОС)</button><button class="aBtn ghost" type="button" data-a="bt-all-subjects">Ағымның барлық пәнін қосу</button></div></div>' +
    '<div class="aCard"><h3>Талдау</h3>' + ta('data.hardTopics', d.hardTopics, { label: 'Жалпы ең қиын тақырыптар (әр жолға біреу)', rows: 3, lines: true }) + ta('data.analysis', d.analysis, { label: 'Жалпы талдау', rows: 4 }) + ta('data.actionPlan', d.actionPlan, { label: 'Келесі кезеңге әрекет жоспары', rows: 4 }) + '</div>';
}
function liveUpdate() {
  var box = $('#liveSum'); if (!box || !AD.ed) return;
  box.innerHTML = AD.ed.type === 'ls' ? lsSummary(AD.ed.data) : AD.ed.type === 'st' ? stSummary(AD.ed.data) : '';
  var st = $('.aBar .aStatus'); if (st) { st.setAttribute('data-dirty', ''); st.innerHTML = '<i></i>Сақталмаған өзгеріс бар'; }
  var top = $('.aTop .aStatus'); if (top) { top.setAttribute('data-dirty', ''); }
  renderHeader();
}
function markDirty() { if (AD.ed) { AD.ed.dirty = true; liveUpdate(); } }
function addItem(key) {
  var d = AD.ed.data;
  if (key === 'lessons') (d.lessons = d.lessons || []).push(blankLesson());
  else if (key === 'difficulties') (d.difficulties = d.difficulties || []).push({ text: '', student: '', count: '' });
  else if (key === 'combos') (d.combos = d.combos || []).push({ comboId: '', score: '', max: (d.overall || {}).max || (d.imported || {}).max || '', submitted: '', retakeCount: '', retakeBase: '', retakePct: '', note: '' });
  else if (key === 'hardTasks') (d.hardTasks = d.hardTasks || []).push({ id: 't' + Date.now().toString(36), variant: '', q: '', title: '', text: '', images: [], wrongPct: '', topic: '', explanation: '' });
  else if (key === 'subjects') (d.subjects = d.subjects || []).push({ subjectId: '', avg: '', max: '', participants: '', top3: [], hardTopics: [], recommendation: '' });
  else if (key === 'subjects-extra') (d.subjects = d.subjects || []).push({ subjectId: null, label: 'ОС', avg: '', max: '', participants: '', top3: [], hardTopics: [], recommendation: '' });
  else {
    var arr = getPath(d, key); if (!Array.isArray(arr)) { arr = []; setPath(d, key, arr); }
    arr.push({ name: '', score: '' });
  }
  AD.ed.dirty = true; renderAdmin();
}
function delItem(key) {
  var ks = key.split('.'), idx = +ks.pop(), arr = getPath(AD.ed.data, ks.join('.'));
  if (Array.isArray(arr)) arr.splice(idx, 1);
  AD.ed.dirty = true; renderAdmin();
}
function metaForCreate() {
  var m = AD.ed.meta, type = AD.ed.type;
  var body = { type: type, stream_id: m.stream_id, data: AD.ed.data };
  if (type === 'bt') { body.scope = m.scope || 'all'; body.period = { test_date: m.test_date, label: m.label, cohort: m.cohort }; }
  else { body.subject_id = m.subject_id; body.period = { month: m.month, week: m.week }; body.teacher_id = m.teacher_id || suggestedTeacher() || null; }
  return body;
}
function saveReport(publish, force) {
  var ed = AD.ed;
  ed.errors = []; ed.warnings = [];
  var p;
  if (ed.isNew) {
    p = api('POST', '/api/reports', metaForCreate()).then(function (r) {
      if (!publish) return r;
      return api('POST', '/api/reports?action=publish', { id: r.report.id, version: r.report.version }).then(function (x) { return { report: x.report, warnings: r.warnings }; });
    });
  } else {
    p = api('PUT', '/api/reports', { id: ed.report.id, version: force ? force : ed.report.version, data: ed.data, teacher_id: ed.meta.teacher_id || null, publish: !!publish });
  }
  return p.then(function (r) {
    setEditor(r.report);
    AD.ed.warnings = r.warnings || [];
    toast(publish ? 'Сақталды және сайтта жарияланды' : 'Жоба ретінде сақталды');
    renderAdmin();
  }).catch(function (e) {
    if (e.status === 409 && e.body && e.body.error === 'exists' && e.body.reportId) {
      renderAdmin(); // алдыңғы қате карточкасы экранда қалмасын
      return confirmBox('Мұндай есеп бар', e.message, [['open', 'Бар есепті ашу', 'primary'], ['no', 'Болдырмау']]).then(function (a) { if (a === 'open') openReport(e.body.reportId); });
    }
    if (e.status === 409 && e.body && e.body.current) {
      var cur = e.body.current;
      renderAdmin();
      return confirmBox('Қатар өңдеу', e.message + '\n\nСоңғы нұсқа: ' + cur.version + ' (' + (cur.updated_by || '') + ', ' + fmtDate(cur.updated_at) + ').', [['mine', 'Менің нұсқамды сақтау (соңғының үстіне)', 'danger'], ['theirs', 'Жаңа нұсқаны ашу (менің өзгерісім жойылады)', 'primary'], ['cancel', 'Болдырмау']]).then(function (a) {
        if (a === 'mine') return saveReport(publish, cur.version);
        if (a === 'theirs') { setEditor(cur); renderAdmin(); }
      });
    }
    ed.errors = e.body && e.body.details ? e.body.details : [e.message];
    toast('Сақталмады: ' + (e.body && e.body.details ? e.body.details.length + ' қате' : e.message), 'bad');
    renderAdmin();
  });
}
function reportAction(kind) {
  var ed = AD.ed, r = ed.report;
  if (kind === 'preview') {
    if (ed.dirty) { toast('Алдымен сақтаңыз: алдын ала қарау сақталған жобаны көрсетеді.', 'bad'); return; }
    var p = findBy(cat().periods || [], r.period_id);
    var key = p ? (p.kind === 'week' ? p.month + '-' + p.week : 'bt-' + (p.test_date || p.label)) : '';
    var url = '/?t=' + r.type + '&s=' + r.stream_id + (r.subject_id ? '&subj=' + r.subject_id : '') + '&p=' + encodeURIComponent(key) + '&drafts=1#r-' + r.id;
    window.open(url, '_blank', 'noopener');
    return;
  }
  if (kind === 'unpublish') {
    return confirmBox('Жариялаудан алу', 'Есеп сайттан жасырылады, мұғалімдер оны көрмейді. Деректер өшпейді.', [['ok', 'Жариялаудан алу', 'danger'], ['no', 'Болдырмау']]).then(function (a) {
      if (a !== 'ok') return;
      api('POST', '/api/reports?action=unpublish', { id: r.id, version: r.version }).then(function (x) { setEditor(x.report); renderAdmin(); toast('Жариялаудан алынды'); }).catch(function (e) { toast(e.message, 'bad'); });
    });
  }
  if (kind === 'delete') {
    return confirmBox('Есепті өшіру', 'Жоба күйіндегі есеп толық өшіріледі. Бұл әрекетті қайтару мүмкін емес.', [['ok', 'Өшіру', 'danger'], ['no', 'Болдырмау']]).then(function (a) {
      if (a !== 'ok') return;
      api('DELETE', '/api/reports?id=' + encodeURIComponent(r.id)).then(function () { AD.ed = null; loadReports().then(renderAdmin); toast('Өшірілді'); }).catch(function (e) { toast(e.message, 'bad'); });
    });
  }
  if (kind === 'revisions') {
    return api('GET', '/api/reports?id=' + encodeURIComponent(r.id) + '&revisions=1').then(function (x) {
      var m = $('#modal');
      m.innerHTML = '<div class="modalBox wide"><h4>Нұсқалар тарихы</h4><div class="aTableWrap"><table class="aTable"><thead><tr><th>Нұсқа</th><th>Әрекет</th><th>Кім</th><th>Қашан</th><th></th></tr></thead><tbody>' + x.revisions.map(function (rv) {
        return '<tr><td>' + rv.version + '</td><td>' + esc(rv.action) + '</td><td>' + esc(rv.actor || '') + '</td><td>' + esc(fmtDate(rv.at)) + '</td><td>' + (isAdmin() ? '<button class="aBtn" type="button" data-restore="' + rv.id + '">Қалпына келтіру</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div><p>' + (isAdmin() ? 'Қалпына келтірілген нұсқа жаңа нұсқа болып сақталады (жоба күйінде); тарих өшпейді. Сайтқа шығару үшін кейін жариялаңыз.' : 'Нұсқаны қалпына келтіруді әкімші жасайды.') + '</p><div class="aRow"><button class="aBtn" type="button" data-close>Жабу</button></div></div>';
      m.hidden = false;
      m.onclick = function (ev) {
        var b = ev.target.closest && ev.target.closest('[data-restore]');
        if (b) {
          api('POST', '/api/reports?action=restore', { id: r.id, revisionId: +b.getAttribute('data-restore'), version: AD.ed.report.version }).then(function (y) { m.hidden = true; setEditor(y.report); renderAdmin(); toast('Нұсқа қалпына келтірілді'); }).catch(function (e) { toast(e.message, 'bad'); });
          return;
        }
        if (ev.target === m || (ev.target.closest && ev.target.closest('[data-close]'))) { m.hidden = true; m.onclick = null; }
      };
    }).catch(function (e) { toast(e.message, 'bad'); });
  }

}

/* ---------------- import ---------------- */
function importHTML() {
  var st = AD.imp.status;
  if (!st) { api('GET', '/api/import').then(function (x) { AD.imp.status = x; renderAdmin(); }).catch(function (e) { toast(e.message, 'bad'); }); return '<div class="aCard">Жүктелуде…</div>'; }
  var sapOn = st.sapaline.configured, platOn = st.platform.configured;
  var resultsHTML = function (res) {
    if (!res) return '';
    if (res.error) return '<div class="aCard errCard">' + esc(res.error) + '</div>';
    var list = res.results || [res];
    return '<div class="aTableWrap"><table class="aTable"><thead><tr><th>Пән</th><th>Нәтиже</th><th>Ескертпелер</th><th></th></tr></thead><tbody>' + list.map(function (r) {
      var s = r.summary;
      return '<tr><td>' + esc(r.subject || '') + (r.teacher ? '<br><small>' + esc(r.teacher) + '</small>' : '') + '</td><td>' + (r.error ? '<span class="warnText">' + esc(r.error) + '</span>' + (r.details ? '<ul>' + r.details.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') :
        s && 'lessons' in s ? s.lessons + ' сабақ · жаңа ' + s.added + ' · жаңартылды ' + s.updated + (s.kept ? ' · сақталды ' + s.kept : '') + (s.skipped.length ? '<br><small>' + s.skipped.length + ' жол өткізілді</small>' : '') :
        s ? fmtNum(s.score) + '/' + fmtNum(s.max) + (s.scoreMethod === 'students' ? ' (оқушылар бойынша)' : ' (топтардың орташасы)') + ' · ' + fmtInt(s.submitted) + ' тапсырды · ' + s.groups + ' топ · ' + s.hardTasks + ' тапсырма' +
          (s.courses && s.courses.length > 1 ? '<ul class="plain small">' + s.courses.map(function (c) { return '<li>' + esc(c.courseName || c.courseId) + (c.comboId ? ' (' + esc((comboOf(c.comboId) || {}).code || '') + ')' : '') + ': ' + (c.found ? fmtNum(c.score) + '/' + fmtNum(c.max) + ' · ' + fmtInt(c.submitted) + ' оқушы' : 'СТ табылмады') + '</li>'; }).join('') + '</ul>' : '') : '') + (r.applied ? '<br><span class="chip on">жобаға сақталды</span>' : r.error ? '' : '<br><span class="chip draft">алдын ала қарау — сақталмады</span>') + '</td>' +
        '<td>' + (s && s.unknownCombos && s.unknownCombos.length ? '<div class="aChecks">' + s.unknownCombos.map(function (c) { return '<span class="aCheck">' + esc(c) + ' <button class="aBtn ghost" type="button" data-combo-new="' + esc(c) + '">+ комбинация</button><button class="aBtn ghost" type="button" data-combo-ignore="' + esc(c) + '">комбинация емес</button></span>'; }).join('') + '</div>' : '') + (s ? '<ul class="plain small">' + s.warnings.slice(0, 12).map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + (s.skipped ? s.skipped.slice(0, 8).map(function (x) { return '<li>' + x.row + '-жол: ' + esc(x.reason) + '</li>'; }).join('') : '') + '</ul>' : '') + '</td>' +
        '<td>' + (r.reportId ? '<button class="aBtn" type="button" data-open="' + esc(r.reportId) + '">Есепті ашу</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  };
  var lsf = AD.imp.lsForm || { stream: F.stream !== 'all' ? F.stream : 'sp1', month: '', week: '', sapPeriod: '', subjects: [] };
  AD.imp.lsForm = lsf;
  var sapSubjects = cat().subjects.filter(function (s) { return s.sapaline_code; });
  return '<div class="aCard"><h3>SapaLine → ЛС</h3>' +
    (sapOn ? '<p class="aHint">Сервистік аккаунт бапталған. SapaLine-нан тек оқылады. Қайта импорт сандарды жаңартады; ментордың пікірі мен ұсынысы өшпейді. Бір сабақ SapaLine id-і бойынша бір рет саналады.</p>' :
      '<p class="aHint warnText">Қосылмаған: SAPALINE_EMAIL және SAPALINE_PASSWORD айнымалылары берілмеген. Төмендегі JSON/қолмен енгізу жолы жұмыс істейді.</p>') +
    '<div class="aRow">' + sel('', lsf.stream, streamOpts(), { label: 'Ағым', name: 'imp-ls-stream' }) +
    (sapOn ? '<button class="aBtn" type="button" data-imp="sap-periods">SapaLine кезеңдері</button>' + (AD.imp.sapPeriods ? sel('', lsf.sapPeriod, [['', '— SapaLine кезеңі —']].concat(AD.imp.sapPeriods.map(function (p) { return [p.id, p.label]; })), { label: 'SapaLine кезеңі', name: 'imp-ls-sapperiod' }) : '') : '') +
    '<label class="aField"><span>Мақсатты оқу айы</span><input class="aIn num" name="imp-ls-month" value="' + esc(lsf.month) + '" inputmode="numeric"></label><label class="aField"><span>Апта</span><input class="aIn num" name="imp-ls-week" value="' + esc(lsf.week) + '" inputmode="numeric"></label></div>' +
    (sapOn ? '<p class="aSrc">Пәндер (SapaLine коды бапталғандар): ' + (sapSubjects.length ? sapSubjects.map(function (s) { return '<label class="aCheck"><input type="checkbox" name="imp-ls-subj" value="' + s.id + '"' + (!lsf.subjects.length || lsf.subjects.indexOf(s.id) >= 0 ? ' checked' : '') + '>' + esc(s.name) + '</label>'; }).join(' ') : '<span class="warnText">ешбір пәнге SapaLine коды берілмеген (Анықтамалық → Пәндер)</span>') + '</p>' +
      '<div class="aRow"><button class="aBtn" type="button" data-imp="ls-preview">Алдын ала қарау</button><button class="aBtn primary" type="button" data-imp="ls-apply">Импорттау (жобаға)</button></div>' + resultsHTML(AD.imp.ls) : '') + '</div>' +
    '<div class="aCard"><h3>Резерв: JSON (бетбелгі / SapaLine экспорты)</h3><p class="aHint">lskb бетбелгісінің v2 пішімі: { "subject": "&lt;SapaLine коды немесе пән&gt;", "period": "5-АЙ 2-АПТА", "rows": [ { "num", "date", "teacher", "agym", "present", "total", "survey": { "liked", "avg", "disliked" } } ] }. Ағым мен мақсатты аптаны жоғарыдан таңдаңыз.</p>' +
    '<div class="aRow">' + sel('', AD.imp.jsonSubject || '', subjOpts('JSON ішіндегі пән'), { label: 'Пән', name: 'imp-json-subject' }) + '<label class="aField"><span>Файл</span><input type="file" accept=".json,application/json" name="imp-json-file"></label></div>' +
    '<textarea class="aTa" name="imp-json-text" rows="5" placeholder="JSON-ды осында қойыңыз">' + esc(AD.imp.jsonText || '') + '</textarea>' +
    '<div class="aRow"><button class="aBtn" type="button" data-imp="json-preview">Алдын ала қарау</button><button class="aBtn primary" type="button" data-imp="json-apply">Импорттау (жобаға)</button></div>' + resultsHTML(AD.imp.json) + '</div>' +
    '<div class="aCard"><h3>JUZ40 платформасы → СТ</h3>' + (platOn ? '<p class="aHint">Платформаға HEAD_TEACHER/ADMIN аккаунтымен тек оқуға кіреді (анализ жүйесінің адаптері). Қайта тапсыру платформадан есептелмейді — оны ментор енгізеді.</p>' :
      '<p class="aHint warnText">Қосылмаған: JUZ40_LOGIN / JUZ40_PASSWORD берілмеген. Төмендегі JSON немесе қолмен енгізу жұмыс істейді.</p>') +
    '<div class="aRow">' + sel('', AD.imp.stStream || 'sp1', streamOpts(), { label: 'Ағым', name: 'imp-st-stream' }) + sel('', AD.imp.stSubject || 'chemistry', subjOpts(), { label: 'Пән', name: 'imp-st-subject' }) +
    '<label class="aField"><span>Оқу айы</span><input class="aIn num" name="imp-st-month" value="' + esc(AD.imp.stMonth || '') + '"></label><label class="aField"><span>Апта</span><input class="aIn num" name="imp-st-week" value="' + esc(AD.imp.stWeek || '') + '"></label></div>' +
    (platOn ? '<div class="aRow"><button class="aBtn" type="button" data-imp="st-tests">Платформадағы СТ-лар</button><button class="aBtn" type="button" data-imp="st-preview">Алдын ала қарау</button><button class="aBtn primary" type="button" data-imp="st-apply">Импорттау (жобаға)</button></div>' +
      (AD.imp.stTests ? '<p class="aSrc">Табылған СТ: ' + AD.imp.stTests.map(function (t) { return t.month + '-ай ' + t.week + '-апта'; }).join(', ') + '</p>' : '') : '') +
    '<details class="aSplit"><summary>JSON резерві (analysis жүйесінің PlatformResult пішімі)</summary><textarea class="aTa" name="imp-st-json" rows="4" placeholder=\'{"score":16.2,"max":20,"submitted":40,"total":45,"groups":[],"questionStats":[],"tasks":[]}\'>' + esc(AD.imp.stJson || '') + '</textarea>' +
    '<div class="aRow"><button class="aBtn" type="button" data-imp="stjson-preview">Алдын ала қарау</button><button class="aBtn primary" type="button" data-imp="stjson-apply">Импорттау (жобаға)</button></div></details>' + resultsHTML(AD.imp.st) + '</div>' +
    '<div class="aCard"><h3>Telegram-дағы бұрынғы есептен жоба</h3><p class="aHint">Мәтінді қойыңыз — сандар формаға алдын ала бөлінеді. Нәтиже тек жоба ретінде ашылады, сіз тексеріп барып сақтайсыз. Негізгі формалар мен импорттың орнын баспайды.</p>' +
    '<div class="aRow">' + sel('', AD.imp.tgType || 'ls', [['ls', 'ЛС'], ['st', 'СТ'], ['bt', 'БТ']], { label: 'Есеп түрі', name: 'imp-tg-type' }) + '</div>' +
    '<textarea class="aTa" name="imp-tg-text" rows="6" placeholder="Telegram хабарламасының мәтіні">' + esc(AD.imp.tgText || '') + '</textarea><div class="aRow"><button class="aBtn primary" type="button" data-imp="tg">Бөлу және жоба ретінде ашу</button></div></div>' +
    '<div class="aCard"><h3>Соңғы импорттар</h3>' + (st.runs.length ? '<div class="aTableWrap"><table class="aTable"><thead><tr><th>Қашан</th><th>Көзі</th><th>Кім</th><th>Күйі</th><th>Параметр</th></tr></thead><tbody>' + st.runs.map(function (r) {
      return '<tr><td>' + esc(fmtDate(r.at)) + '</td><td>' + esc(r.source) + '</td><td>' + esc(r.actor || '') + '</td><td>' + esc(r.status) + '</td><td><small>' + esc(JSON.stringify(r.params)) + '</small></td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="aEmpty">Әзірге импорт болмаған.</div>') + '</div>';
}
function impVal(name) { var el = $('[name="' + name + '"]', adminEl); return el ? el.value : ''; }
function runImport(kind) {
  var I = AD.imp;
  var lsBase = function () { return { stream: impVal('imp-ls-stream'), month: impVal('imp-ls-month'), week: impVal('imp-ls-week') }; };
  if (kind === 'sap-periods') {
    return api('POST', '/api/import?action=sapaline-periods', { stream: impVal('imp-ls-stream') }).then(function (x) { I.sapPeriods = x.periods; I.lsForm.stream = impVal('imp-ls-stream'); renderAdmin(); }).catch(function (e) { toast(e.message, 'bad'); });
  }
  if (kind === 'ls-preview' || kind === 'ls-apply') {
    var b = lsBase(); b.mode = 'sapaline'; b.sapalinePeriodId = impVal('imp-ls-sapperiod'); b.subjects = $$('[name="imp-ls-subj"]:checked', adminEl).map(function (x) { return x.value; }); b.apply = kind === 'ls-apply';
    I.lsForm = { stream: b.stream, month: b.month, week: b.week, sapPeriod: b.sapalinePeriodId, subjects: b.subjects };
    return api('POST', '/api/import?action=ls', b).then(function (x) { I.ls = x; I.status = null; renderAdmin(); toast(b.apply ? 'Импорт жобаға сақталды — тексеріп, жариялаңыз' : 'Алдын ала есеп дайын'); }).catch(function (e) { I.ls = { error: e.message }; renderAdmin(); });
  }
  if (kind === 'json-preview' || kind === 'json-apply') {
    var txt = impVal('imp-json-text'); I.jsonText = txt; I.jsonSubject = impVal('imp-json-subject');
    var payload; try { payload = JSON.parse(txt); } catch (e) { toast('JSON дұрыс емес: ' + e.message, 'bad'); return; }
    var bj = lsBase(); bj.mode = 'json'; bj.payload = payload; bj.subject = I.jsonSubject || undefined; bj.apply = kind === 'json-apply';
    I.lsForm.stream = bj.stream; I.lsForm.month = bj.month; I.lsForm.week = bj.week;
    return api('POST', '/api/import?action=ls', bj).then(function (x) { I.json = x; I.status = null; renderAdmin(); }).catch(function (e) { I.json = { error: e.message }; renderAdmin(); });
  }
  var stBase = function () { I.stStream = impVal('imp-st-stream'); I.stSubject = impVal('imp-st-subject'); I.stMonth = impVal('imp-st-month'); I.stWeek = impVal('imp-st-week'); return { stream: I.stStream, subject: I.stSubject, month: I.stMonth, week: I.stWeek }; };
  if (kind === 'st-tests') return api('POST', '/api/import?action=platform-tests', stBase()).then(function (x) { I.stTests = x.tests; renderAdmin(); }).catch(function (e) { toast(e.message, 'bad'); });
  if (kind === 'st-preview' || kind === 'st-apply' || kind === 'stjson-preview' || kind === 'stjson-apply') {
    var bs = stBase(); bs.apply = /apply$/.test(kind);
    if (/^stjson/.test(kind)) { I.stJson = impVal('imp-st-json'); try { bs.payload = JSON.parse(I.stJson); } catch (e) { toast('JSON дұрыс емес: ' + e.message, 'bad'); return; } bs.mode = 'json'; }
    return api('POST', '/api/import?action=st', bs).then(function (x) { x.subject = (subjOf(bs.subject) || {}).name; I.st = x; I.status = null; renderAdmin(); }).catch(function (e) { I.st = { error: e.message }; renderAdmin(); });
  }
  if (kind === 'tg') {
    I.tgType = impVal('imp-tg-type'); I.tgText = impVal('imp-tg-text');
    return api('POST', '/api/import?action=telegram', { type: I.tgType, text: I.tgText }).then(function (x) {
      var low = x.found.filter(function (f) { return f.confidence !== 'high'; }).map(function (f) { return f.field + ' = ' + f.value; });
      newReport(I.tgType, { stream_id: x.draft.stream_id, subject_id: x.draft.subject_id, period: x.draft.period, teacher_id: x.draft.teacher_id, data: x.draft.data, lowConfidence: low.length ? low : ['(табылған мәндер: ' + x.found.length + ')'] });
    }).catch(function (e) { toast(e.message, 'bad'); });
  }
}

/* ---------------- catalog ---------------- */
var CAT_SPEC = {
  subjects: { title: 'Пәндер', cols: [['name', 'Атауы'], ['short', 'Қысқа'], ['glyph', 'Таңба'], ['sapaline_code', 'SapaLine коды'], ['platform_code', 'Платформа коды'], ['max_bt', 'БТ макс. балл'], ['sort', 'Рет', 'num'], ['active', 'Белсенді', 'bool']] },
  streams: { title: 'Ағымдар', cols: [['name', 'Атауы'], ['short', 'Қысқа'], ['sort', 'Рет', 'num'], ['active', 'Белсенді', 'bool']] },
  combinations: { title: 'Комбинациялар', cols: [['code', 'Коды'], ['name', 'Атауы'], ['aliases', 'Баламалы кодтар (үтірмен)', 'list'], ['subjects', 'Пәндер (id, үтірмен)', 'list'], ['sort', 'Рет', 'num'], ['active', 'Белсенді', 'bool']] },
  teachers: { title: 'Мұғалімдер', cols: [['photo', 'Фото', 'photo'], ['full_name', 'Аты-жөні'], ['display', 'Сайттағы аты'], ['aliases', 'SapaLine-дағы басқа аттары (үтірмен)', 'list'], ['active', 'Белсенді', 'bool']] },
  assignments: { title: 'Тағайындаулар', cols: [['stream_id', 'Ағым', 'stream'], ['subject_id', 'Пән', 'subject'], ['teacher_id', 'Мұғалім', 'teacher'], ['valid_from', 'Басталуы', 'date'], ['valid_to', 'Аяқталуы', 'date'], ['note', 'Ескертпе']] },
  periods: { title: 'Кезеңдер', cols: [['stream_id', 'Ағым', 'stream'], ['kind', 'Түрі', 'kind'], ['month', 'Ай', 'num'], ['week', 'Апта', 'num'], ['label', 'Атауы'], ['test_date', 'БТ күні', 'date'], ['cohort', 'Когорта'], ['date_from', 'Басы', 'date'], ['date_to', 'Соңы', 'date'], ['seq', 'Рет (seq)', 'num']] }
};
function cell(kind, col, row, i) {
  var name = 'c-' + i + '-' + col[0], val = col[0] === 'max_bt' ? ((row.max_scores || {}).bt) : row[col[0]];
  var t = col[2];
  if (t === 'bool') return '<label class="aToggle"><input type="checkbox" name="' + name + '"' + (val !== false ? ' checked' : '') + '></label>';
  if (t === 'stream') return '<select class="aSel" name="' + name + '">' + streamOpts().map(function (x) { return opt(x[0], x[1], val); }).join('') + '</select>';
  if (t === 'subject') return '<select class="aSel" name="' + name + '">' + subjOpts().map(function (x) { return opt(x[0], x[1], val); }).join('') + '</select>';
  if (t === 'teacher') return '<select class="aSel" name="' + name + '">' + teacherOpts().map(function (x) { return opt(x[0], x[1], val); }).join('') + '</select>';
  if (t === 'kind') return '<select class="aSel" name="' + name + '">' + opt('week', 'Оқу аптасы', val) + opt('bt', 'БТ', val) + '</select>';
  if (t === 'photo') return '<label class="tPhoto small">' + (val ? '<img src="' + esc(val) + '" alt="">' : esc(initials(row.full_name))) + (row.id ? '<input type="file" accept="image/*" data-photo="' + esc(row.id) + '" aria-label="Фото жүктеу">' : '') + '</label>';
  if (t === 'list') return '<input class="aIn" name="' + name + '" value="' + esc((val || []).join(', ')) + '">';
  return '<input class="aIn' + (t === 'num' ? ' num' : '') + '" name="' + name + '" value="' + esc(v(val)) + '"' + (t === 'date' ? ' type="date"' : '') + '>';
}
function catalogHTML() {
  var kind = AD.catKind, spec = CAT_SPEC[kind];
  var rows = (cat()[kind] || []).slice();
  if (kind === 'assignments' && AD.catStream) rows = rows.filter(function (r) { return r.stream_id === AD.catStream; });
  if (kind === 'periods' && AD.catStream) rows = rows.filter(function (r) { return r.stream_id === AD.catStream; });
  var blank = {};
  var body = rows.map(function (r, i) {
    return '<tr data-row="' + i + '" data-id="' + esc(r.id) + '">' + spec.cols.map(function (c) { return '<td>' + cell(kind, c, r, i) + '</td>'; }).join('') +
      '<td class="nowrap"><button class="aBtn" type="button" data-cat-save="' + i + '">Сақтау</button><button class="aBtn ghost danger" type="button" data-cat-del="' + esc(r.id) + '">✕</button></td></tr>';
  }).join('') + '<tr data-row="new" class="newRow">' + spec.cols.map(function (c) { return '<td>' + (c[2] === 'photo' ? '' : cell(kind, c, blank, 'new')) + '</td>'; }).join('') + '<td><button class="aBtn primary" type="button" data-cat-save="new">+ Қосу</button></td></tr>';
  var hints = {
    teachers: 'Бір адам — бір профиль. Пән/ағым тағайындаулары бөлек. Фотосы жоқ мұғалімге инициалдар көрсетіледі — бөтен адамның фотосын қоймаңыз.',
    assignments: 'Мұғалім ауысса: ескі тағайындауға «Аяқталуы» күнін қойып, жаңасын қосыңыз. Бұрынғы есептердегі мұғалім өзгермейді.',
    periods: 'Әр ағымның өз күнтізбесі. «Алдыңғы апта» осы тізімдегі seq бойынша тікелей алдыңғы апта: айда неше апта болғаны жорамалданбайды. Аптаны өткізіп алмаңыз — бос апта «дерек жоқ» болып көрсетіледі.',
    combinations: 'Импорт кодты бос орын, сызықша, әріп өлшеміне қарамай таниды («ДЖТАНГЛ-IELTS» = «ДЖТАНГЛ IELTS»). Баламалы кодтар (мысалы БХ) де танылады. «Пәндер» — комбинацияға кіретін пәндер id-і (' + cat().subjects.map(function (s) { return s.id; }).join(', ') + '): есеп формасында тек сол пәнге қатысты комбинациялар ұсынылады. Есептерде қолданылған комбинацияны өшірудің орнына «белсенді емес» етіңіз.',
    subjects: 'SapaLine / платформа кодтары импорт үшін керек; оларды «Импорт баптауы» бөліміндегі «Анықтау» арқылы тексеріңіз.'
  };
  return '<div class="aCard"><div class="aTabs inner">' + Object.keys(CAT_SPEC).map(function (k) { return '<button class="aTab" type="button" data-cat="' + k + '" aria-selected="' + (k === kind) + '">' + CAT_SPEC[k].title + ' <small>' + (cat()[k] || []).length + '</small></button>'; }).join('') + '</div>' +
    '<p class="aHint">' + esc(hints[kind] || '') + '</p>' +
    (kind === 'periods' ? '<div class="aCard inner"><b>Айдың апталарын күнтізбеге қосу</b><div class="aRow">' + sel('', AD.fillStream || 'sp1', streamOpts(), { label: 'Ағым', name: 'fill-stream' }) +
      '<label class="aField"><span>Оқу айы</span><input class="aIn num" name="fill-month" value="' + esc(AD.fillMonth || '') + '" inputmode="numeric"></label><label class="aField"><span>Апта саны</span><input class="aIn num" name="fill-weeks" value="' + esc(AD.fillWeeks || '4') + '" inputmode="numeric"></label>' +
      '<button class="aBtn primary" type="button" data-a="fill-weeks">Қосу</button></div><p class="aSrc">Бар апталар өзгермейді, жоқтары ғана қосылады. Күнтізбе толық болса, «алдыңғы апта» дұрыс табылады.</p></div>' : '') +
    (kind === 'assignments' || kind === 'periods' ? '<div class="aRow">' + sel('', AD.catStream || '', streamOpts('Барлық ағым'), { label: 'Ағым сүзгісі', name: 'cat-stream' }) + '</div>' : '') +
    '<div class="aTableWrap"><table class="aTable catTable"><thead><tr>' + spec.cols.map(function (c) { return '<th>' + esc(c[1]) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
}
function catRowValues(kind, key) {
  var spec = CAT_SPEC[kind], item = {};
  spec.cols.forEach(function (c) {
    if (c[2] === 'photo') return;
    var el = $('[name="c-' + key + '-' + c[0] + '"]', adminEl); if (!el) return;
    var val = c[2] === 'bool' ? el.checked : el.value;
    if (c[2] === 'list') val = String(val).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (c[0] === 'max_bt') { item.max_scores = { bt: val === '' ? null : toNum(val) }; return; }
    item[c[0]] = val;
  });
  return item;
}
function saveCat(key) {
  var kind = AD.catKind, item = catRowValues(kind, key);
  if (key !== 'new') {
    var tr = $('tr[data-row="' + key + '"]', adminEl); item.id = tr.getAttribute('data-id');
    if (kind === 'subjects') { var cur = findBy(cat().subjects, item.id); item.max_scores = Object.assign({}, cur.max_scores || {}, item.max_scores || {}); }
  }
  return api('POST', '/api/catalog', { kind: kind, item: item }).then(function () { return reloadCatalog(); }).then(function () { renderAdmin(); toast('Сақталды'); }).catch(function (e) { toast(e.message, 'bad'); });
}
function uploadPhoto(input) {
  var file = input.files && input.files[0]; if (!file) return;
  var id = input.getAttribute('data-photo');
  var img = new Image(), url = URL.createObjectURL(file);
  img.onload = function () {
    var max = 900, w = img.width, h = img.height, k = Math.min(1, max / Math.max(w, h));
    var cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(url);
    api('POST', '/api/photo', { teacherId: id, dataUrl: cv.toDataURL('image/jpeg', 0.86) }).then(function () { return reloadCatalog(); }).then(function () { renderAdmin(); toast('Фото жүктелді'); }).catch(function (e) { toast(e.message, 'bad'); });
  };
  img.onerror = function () { toast('Суретті оқу мүмкін болмады', 'bad'); };
  img.src = url;
}

/* ---------------- users ---------------- */
function usersHTML() {
  if (!AD.usersLoaded) { AD.usersLoaded = true; api('GET', '/api/users').then(function (x) { AD.users = x.users; renderAdmin(); }).catch(function (e) { toast(e.message, 'bad'); }); }
  var u = AD.userEdit || { role: 'viewer', scope: {} };
  var chk = function (name, list, items) { return items.map(function (x) { return '<label class="aCheck"><input type="checkbox" name="' + name + '" value="' + esc(x[0]) + '"' + ((list || []).indexOf(x[0]) >= 0 ? ' checked' : '') + '>' + esc(x[1]) + '</label>'; }).join(''); };
  return '<div class="aCard"><h3>' + (u.id ? 'Аккаунтты өзгерту: ' + esc(u.username) : 'Жаңа аккаунт') + '</h3><p class="aHint">Әр адамға жеке аккаунт. Көруші — жарияланған есептерді көреді; ментор — есеп енгізеді; әкімші — бәрі. Нақты аккаунттарды тек әкімші жасайды.</p>' +
    '<div class="aRow"><label class="aField"><span>Логин</span><input class="aIn" name="u-username" value="' + esc(u.username || '') + '" autocomplete="off"></label><label class="aField"><span>Аты-жөні</span><input class="aIn" name="u-display" value="' + esc(u.displayName || '') + '"></label>' +
    sel('', u.role, [['viewer', 'Көруші (мұғалім / команда)'], ['mentor', 'Ментор'], ['admin', 'Әкімші']], { label: 'Рөлі', name: 'u-role' }) +

    '<label class="aField"><span>' + (u.id ? 'Жаңа құпиясөз (бос — өзгермейді)' : 'Құпиясөз (кемі 8 таңба)') + '</span><input class="aIn" name="u-password" type="password" autocomplete="new-password"></label>' +
    '<label class="aCheck"><input type="checkbox" name="u-active"' + (u.active !== false ? ' checked' : '') + '>Белсенді</label></div>' +
    '<p class="aSrc">Ментордың рұқсат аумағы (бос — шектеусіз): ағымдар ' + chk('u-sc-streams', (u.scope || {}).streams, cat().streams.map(function (s) { return [s.id, s.short]; })) + ' · түрлер ' + chk('u-sc-types', (u.scope || {}).types, [['ls', 'ЛС'], ['st', 'СТ'], ['bt', 'БТ']]) + '</p>' +
    '<details class="aSplit"><summary>Пәндер бойынша шектеу</summary>' + chk('u-sc-subjects', (u.scope || {}).subjects, cat().subjects.map(function (s) { return [s.id, s.name]; })) + '</details>' +
    '<div class="aRow"><button class="aBtn primary" type="button" data-a="user-save">Сақтау</button>' + (u.id ? '<button class="aBtn ghost" type="button" data-a="user-new">Жаңа аккаунт</button>' : '') + '</div></div>' +
    '<div class="aCard"><h3>Аккаунттар</h3>' + (AD.users.length ? '<div class="aTableWrap"><table class="aTable"><thead><tr><th>Логин</th><th>Аты</th><th>Рөлі</th><th>Күйі</th><th></th></tr></thead><tbody>' + AD.users.map(function (x) {
      return '<tr><td>' + esc(x.username) + '</td><td>' + esc(x.displayName) + '</td><td>' + esc(ROLE_NAME[x.role]) + '</td><td>' + (x.active ? '<span class="chip on">белсенді</span>' : '<span class="chip">өшірілген</span>') + '</td><td><button class="aBtn" type="button" data-user="' + esc(x.id) + '">Өзгерту</button></td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="aEmpty">Аккаунттар жүктелуде…</div>') + '</div>';
}
function saveUser() {
  var u = AD.userEdit || {};
  var vals = function (n) { return $$('[name="' + n + '"]:checked', adminEl).map(function (x) { return x.value; }); };
  var body = { id: u.id, username: impVal('u-username'), displayName: impVal('u-display'), role: impVal('u-role'), teacherId: u.teacherId || null, password: impVal('u-password') || undefined, active: $('[name="u-active"]', adminEl).checked, scope: { streams: vals('u-sc-streams'), types: vals('u-sc-types'), subjects: vals('u-sc-subjects') } };
  return api('POST', '/api/users', body).then(function () { AD.userEdit = null; AD.usersLoaded = false; renderAdmin(); toast('Аккаунт сақталды'); }).catch(function (e) { toast(e.message, 'bad'); });
}

/* ---------------- settings (import mappings) ---------------- */
function settingsHTML() {
  var st = AD.imp.status;
  if (!st) { api('GET', '/api/import').then(function (x) { AD.imp.status = x; renderAdmin(); }); return '<div class="aCard">Жүктелуде…</div>'; }
  var sc = AD.sapCfg || deep(st.sapaline.config) || {}; AD.sapCfg = sc;
  sc.divisions = sc.divisions || {}; sc.agym = sc.agym || []; sc.understandingKeys = sc.understandingKeys || {};
  var pc = AD.platCfg || deep(st.platform.config) || {}; AD.platCfg = pc;
  pc.courses = pc.courses || {}; pc.groups = pc.groups || {};
  var disc = AD.discover;
  var pairs = [];
  cat().streams.forEach(function (s) { cat().subjects.forEach(function (x) { pairs.push([s, x]); }); });
  var pf = AD.platFilter || 'sp1';
  return '<div class="aCard"><h3>SapaLine баптауы</h3><p class="aHint">' + (st.sapaline.configured ? 'Аккаунт бапталған.' : '<span class="warnText">SAPALINE_EMAIL / SAPALINE_PASSWORD берілмеген — «Анықтау» жұмыс істемейді.</span>') +
    ' SMART PRO-ның SapaLine-дағы нақты division мәні мен пән кодтары әзірлеу кезінде тексерілмеді: «Анықтау» батырмасымен SapaLine-ның өзінен көріп, төменге жазыңыз. Жорамалмен бекітілмейді.</p>' +
    '<div class="aRow">' + cat().streams.map(function (s) { return '<label class="aField"><span>' + esc(s.name) + ' — division</span><input class="aIn" data-cfg="sap.divisions.' + s.id + '" value="' + esc(sc.divisions[s.id] || '') + '"></label>'; }).join('') +
    (st.sapaline.configured ? '<button class="aBtn" type="button" data-a="discover">Анықтау</button>' : '') + '</div>' +
    (disc ? '<div class="aCard inner"><p><b>SapaLine-дағы division мәндері:</b> ' + disc.divisions.map(esc).join(', ') + '</p>' + (disc.subjects.length ? '<p><b>Пән кодтары:</b> ' + disc.subjects.map(esc).join(', ') + '</p>' + sapCodeCheck(disc) + '<p><b>Ағым кодтары</b> (басып, біздің ағымға тіркеңіз):</p><div class="aChecks">' + disc.streams.map(function (code) { var have = (sc.agym || []).some(function (r) { return r.agym === code; }); return '<span class="aCheck">' + esc(code) + (have ? ' ✓' : cat().streams.map(function (st) { return ' <button class="aBtn ghost" type="button" data-agym-add="' + esc(code) + '" data-agym-stream="' + st.id + '">→ ' + esc(st.short) + '</button>'; }).join('')) + '</span>'; }).join('') + '</div><p><p><b>Мұғалімдер:</b> ' + disc.teachers.map(esc).join(', ') + '</p><p><b>Сауалнама кілттері:</b> ' + disc.surveyKeys.map(esc).join(', ') + '</p>' : '<p class="aSrc">Пән/ағым кодтарын көру үшін division жазып, қайта «Анықтау» басыңыз.</p>') + '</div>' : '') +
    '<h3>SapaLine ағым коды → ағым және комбинация</h3><p class="aHint">Әдетте ереже керек емес: «ИНФОМАТ-1» сияқты кодтың соңғы саны — ағым (1 → SP-1), алдыңғы бөлігі — комбинация коды (Анықтамалықтағы кодпен сәйкестендіріледі). «ГЕОМАТ-1, ФИЗМАТ-1» — ортақ сабақ. Осы ережеге бағынбайтын код болса ғана төменге қосыңыз.</p>' +
    sc.agym.map(function (r, i) {
      return '<div class="aRow tight"><label class="aField"><span>SapaLine «stream» мәні</span><input class="aIn" data-cfg="sap.agym.' + i + '.agym" value="' + esc(r.agym || '') + '"></label>' +
        '<label class="aField"><span>Ағым</span><select class="aSel" data-cfg="sap.agym.' + i + '.stream">' + streamOpts().map(function (x) { return opt(x[0], x[1], r.stream); }).join('') + '</select></label>' +
        '<span class="aField"><span>Комбинация</span><span class="aChecks">' + cat().combinations.map(function (c) { return '<label class="aCheck"><input type="checkbox" data-cfg-combo="' + i + '" value="' + c.id + '"' + ((r.combos || []).indexOf(c.id) >= 0 ? ' checked' : '') + '>' + esc(c.code) + '</label>'; }).join('') + '</span></span>' +
        '<button class="aBtn ghost danger" type="button" data-cfg-del="' + i + '">✕</button></div>';
    }).join('') + '<button class="aBtn" type="button" data-a="agym-add">+ Ағым коды</button>' +
    '<h3>Түсіну деңгейі: SapaLine сауалнама кілттері</h3><p class="aHint">Бос болса, түсіну деңгейін ментор қолмен енгізеді (импорт жорамалмен оқымайды).</p><div class="aRow">' +
    UNDERSTANDING.map(function (c) { return '<label class="aField"><span>' + c.label + '</span><input class="aIn" data-cfg="sap.understandingKeys.' + c.key + '" value="' + esc(sc.understandingKeys[c.key] || '') + '"></label>'; }).join('') + '</div>' +
    '<div class="aRow"><button class="aBtn primary" type="button" data-a="sap-save">SapaLine баптауын сақтау</button></div></div>' +
    '<div class="aCard"><h3>JUZ40 платформасы баптауы</h3><p class="aHint">' + (st.platform.configured ? 'Аккаунт бапталған.' : '<span class="warnText">JUZ40_LOGIN / JUZ40_PASSWORD берілмеген.</span>') + ' Әр ағым × пәнге платформадағы курс id-ін беріңіз. Бір комбинация әрдайым бір курс деп жорамалданбайды: топтардың комбинацияға сәйкестігін «Топ атауы = код» жолдарымен жазыңыз.</p>' +
    (st.platform.configured ? '<div class="aRow"><button class="aBtn" type="button" data-a="plat-subjects">Платформадағы пәндерді анықтау</button></div>' + platSubjectsHTML() : '') +
    '<div class="aRow">' + sel('', pc.scoreMethod || 'groups', [['groups', 'Топтардың орташа балдарының орташасы (әдепкі)'], ['students', 'Барлық оқушы бойынша (тапсырған санымен салмақталған)']], { label: 'Ортақ балл қалай есептеледі', name: 'plat-method' }) + '</div>' +
    '<div class="aRow">' + sel('', pf, streamOpts(), { label: 'Ағым', name: 'plat-filter' }) + '<label class="aField"><span>Қиын тапсырмалар саны (импортта)</span><input class="aIn num" data-cfg="plat.hardTaskLimit" value="' + esc(pc.hardTaskLimit || 10) + '"></label></div>' +
    '<div class="aTableWrap"><table class="aTable"><thead><tr><th>Пән</th><th colspan="2">Платформадағы курстар (бірнеше болуы мүмкін) және курстың комбинациясы</th><th>Топ → комбинация</th><th></th></tr></thead><tbody>' +
    pairs.filter(function (p) { return p[0].id === pf; }).map(function (p) {
      var key = p[0].id + '.' + p[1].id, list = courseList(key), g = pc.groups[key] || {};
      return '<tr><td>' + esc(p[1].name) + (p[1].platform_code ? '<br><small>код: ' + esc(p[1].platform_code) + '</small>' : '') + '</td><td colspan="2">' +
        list.map(function (c, ci) {
          return '<div class="aRow tight"><code>' + esc(c.courseId) + '</code> ' + esc(c.courseName || '') +
            '<select class="aSel" data-course-combo="' + esc(key) + '" data-ci="' + ci + '">' + (function () { var d = detectComboClient(c.courseName), cur = c.comboId == null ? '__auto' : c.comboId; return opt('__auto', 'авто: ' + (d ? d.code : 'табылмады'), cur) + opt('', 'комбинациясыз (тек жалпы)', cur); })() + combosFor(p[1].id, [c.comboId]).map(function (x) { return opt(x.id, x.code, c.comboId == null ? '__auto' : c.comboId); }).join('') + '</select>' +
            '<button class="aBtn ghost danger" type="button" data-course-del="' + esc(key) + '" data-ci="' + ci + '">✕</button></div>';
        }).join('') +
        '<div class="aRow tight"><input class="aIn" placeholder="курс id-ін қолмен қосу" data-course-manual="' + esc(key) + '"><button class="aBtn ghost" type="button" data-course-manual-add="' + esc(key) + '">+</button></div></td>' +
        '<td><textarea class="aTa" rows="2" data-cfg-groups="' + key + '" placeholder="Куратор Аты = БХ">' + esc(Object.keys(g).map(function (k) { var cc = comboOf(g[k]); return k + ' = ' + (cc ? cc.code : g[k]); }).join('\n')) + '</textarea></td>' +
        '<td>' + (st.platform.configured && p[1].platform_code ? '<button class="aBtn ghost" type="button" data-courses="' + esc(p[1].platform_code) + '" data-courses-subj="' + esc(p[1].id) + '">Курстар</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
    (AD.courses ? '<div class="aCard inner"><p><b>Платформадағы курстар (' + esc(AD.courses.code) + '):</b></p><ul class="plain small">' + AD.courses.list.map(function (c) { return '<li><code>' + esc(c.id) + '</code> — ' + esc(c.name) + (c.year ? ' · ' + c.year : '') + (c.active ? '' : ' · белсенді емес') + ' ' + cat().streams.map(function (st) { return '<button class="aBtn ghost" type="button" data-course="' + esc(c.id) + '" data-course-name="' + esc(c.name) + '" data-course-key="' + st.id + '.' + esc(AD.courses.subject) + '">→ ' + esc(st.short) + '</button>'; }).join('') + '</li>'; }).join('') + '</ul></div>' : '') +
    '<div class="aRow"><button class="aBtn primary" type="button" data-a="plat-save">Платформа баптауын сақтау</button></div></div>';
}
function sapCodeCheck(disc) {
  var missing = cat().subjects.filter(function (x) { return x.sapaline_code && disc.subjects.indexOf(x.sapaline_code) < 0; });
  return missing.length ? '<p class="warnText">Бұл кезеңде SapaLine-да кездеспеген пән кодтары: ' + missing.map(function (x) { return esc(x.name + ' (' + x.sapaline_code + ')'); }).join(', ') + '. Ол пәнде сабақ болмаған болуы мүмкін, не код басқа — Анықтамалық → Пәндер.</p>' : '<p class="aSrc">Барлық пәннің SapaLine коды табылды ✓</p>';
}
function normName(x) { return String(x || '').toLowerCase().replace(/[^a-zа-яәғқңөұүһі0-9]+/gi, ' ').trim(); }
function platSubjectsHTML() {
  var ps = AD.platSubjects; if (!ps) return '';
  var rows = cat().subjects.map(function (x) {
    var m = ps.filter(function (p) { return normName(p.nameKz) === normName(x.name); })[0];
    var val = x.platform_code || (m && m.shortName) || '';
    return '<tr><td>' + esc(x.name) + '</td><td><select class="aSel" data-plat-code="' + esc(x.id) + '">' + opt('', '— жоқ —', val) + ps.map(function (p) { return opt(p.shortName, p.shortName + ' — ' + p.nameKz, val); }).join('') + '</select></td></tr>';
  }).join('');
  return '<div class="aCard inner"><p><b>Платформадағы пәндер</b> (атауы сәйкес келгендері өзі таңдалды — тексеріңіз):</p><div class="aTableWrap"><table class="aTable"><thead><tr><th>Біздің пән</th><th>Платформадағы пән</th></tr></thead><tbody>' + rows + '</tbody></table></div><div class="aRow"><button class="aBtn primary" type="button" data-a="plat-codes-save">Пән кодтарын сақтау</button></div></div>';
}
/** Ағым × пәннің курстар тізімі (бұрынғы бір курстық пішім де тізімге айналады). */
function courseList(key) {
  var v = AD.platCfg.courses[key];
  if (!v) return [];
  if (!Array.isArray(v)) { v = v.courseId ? [v] : []; AD.platCfg.courses[key] = v; }
  return v;
}
function cfgInput(el) {
  var p = el.getAttribute('data-cfg'), root = p.indexOf('sap.') === 0 ? AD.sapCfg : AD.platCfg;
  var path = p.replace(/^(sap|plat)\./, '');
  setPath(root, path, el.value);
}
function parseGroups(text) {
  var out = {};
  String(text || '').split('\n').forEach(function (l) {
    var m = /^(.*?)\s*=\s*(.+)$/.exec(l.trim()); if (!m || !m[1]) return;
    var code = m[2].trim(), c = cat().combinations.filter(function (x) { return x.code === code || x.id === code; })[0];
    if (c) out[m[1].trim()] = c.id;
  });
  return out;
}

/* ---------------- history ---------------- */
function historyHTML() {
  if (!AD.auditLoaded) { AD.auditLoaded = true; api('GET', '/api/audit?limit=300').then(function (x) { AD.audit = x.audit; renderAdmin(); }).catch(function (e) { toast(e.message, 'bad'); }); }
  return '<div class="aCard"><h3>Өзгерістер тарихы</h3><p class="aHint">Анықтамалық, пайдаланушылар, есептер және импорт баптауы бойынша кім, не, қашан өзгерткені. Есептің өз нұсқалары есеп ішіндегі «Нұсқалар» батырмасында.</p>' +
    (AD.audit.length ? '<div class="aTableWrap"><table class="aTable"><thead><tr><th>Қашан</th><th>Кім</th><th>Нысан</th><th>Әрекет</th><th>Мәлімет</th></tr></thead><tbody>' + AD.audit.map(function (a) {
      return '<tr><td><small>' + esc(fmtDate(a.at)) + '</small></td><td>' + esc(a.actor || '') + '</td><td>' + esc(a.entity) + '<br><small>' + esc(a.entity_id || '') + '</small></td><td>' + esc(a.action) + '</td><td>' + (a.before || a.after ? '<details><summary>көру</summary><pre class="aPre">' + esc(JSON.stringify({ before: a.before, after: a.after }, null, 1)).slice(0, 4000) + '</pre></details>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="aEmpty">Жүктелуде…</div>') + '</div>';
}

/* ---------------- admin events ---------------- */
adminEl.addEventListener('input', function (ev) {
  var t = ev.target;
  if (t.hasAttribute('data-path') && AD.ed) {
    var p = t.getAttribute('data-path');
    if (t.hasAttribute('data-lines')) { AD.ed.dirty = true; liveUpdate(); return; }
    if (p.indexOf('meta.') === 0) { AD.ed.meta[p.slice(5)] = t.value; AD.ed.dirty = true; return; }
    setPath(AD.ed, p, t.value);
    markDirty();
  }
  if (t.hasAttribute('data-cfg')) cfgInput(t);
});
adminEl.addEventListener('change', function (ev) {
  var t = ev.target;
  if (t.hasAttribute('data-lines') && AD.ed) {
    setPath(AD.ed, t.getAttribute('data-path'), t.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean));
    markDirty(); return;
  }
  if (t.tagName === 'SELECT' && t.hasAttribute('data-path') && AD.ed) {
    var p = t.getAttribute('data-path');
    if (p.indexOf('meta.') === 0) { AD.ed.meta[p.slice(5)] = t.value; AD.ed.dirty = true; if (p === 'meta.stream_id' || p === 'meta.subject_id') { AD.ed.meta.teacher_id = ''; renderAdmin(); } return; }
    setPath(AD.ed, p, t.value); markDirty(); return;
  }
  if (t.hasAttribute('data-combo-toggle') && AD.ed) {
    var path = t.getAttribute('data-combo-toggle'), list = getPath(AD.ed, path) || [];
    if (t.checked && list.indexOf(t.value) < 0) list.push(t.value);
    if (!t.checked) list = list.filter(function (x) { return x !== t.value; });
    setPath(AD.ed, path, list);
    var lesson = getPath(AD.ed, path.replace(/\.combos$/, ''));
    if (lesson) { lesson.combosManual = true; Object.keys(lesson.split || {}).forEach(function (c) { if (list.indexOf(c) < 0) delete lesson.split[c]; }); }
    AD.ed.dirty = true; renderAdmin(); return;
  }
  if (t.hasAttribute('data-bool') && AD.ed) { setPath(AD.ed, t.getAttribute('data-bool'), t.checked); AD.ed.dirty = true; renderAdmin(); return; }
  if (t.hasAttribute('data-photo')) { uploadPhoto(t); return; }
  if (t.hasAttribute('data-cfg-combo')) {
    var i = +t.getAttribute('data-cfg-combo'), r = AD.sapCfg.agym[i]; r.combos = r.combos || [];
    if (t.checked) r.combos.push(t.value); else r.combos = r.combos.filter(function (x) { return x !== t.value; });
    return;
  }
  if (t.hasAttribute('data-course-combo')) { courseList(t.getAttribute('data-course-combo'))[+t.getAttribute('data-ci')].comboId = t.value === '__auto' ? null : t.value; return; }
  if (t.hasAttribute('data-cfg-groups')) { AD.platCfg.groups[t.getAttribute('data-cfg-groups')] = parseGroups(t.value); return; }
  if (t.tagName === 'SELECT' && t.hasAttribute('data-cfg')) { cfgInput(t); return; }
  var n = t.getAttribute('name');
  if (n && n.indexOf('rf-') === 0) { AD.rf[n.slice(3)] = t.value; loadReports().then(renderAdmin); return; }
  if (n === 'cat-stream') { AD.catStream = t.value; renderAdmin(); return; }
  if (n === 'plat-filter') { AD.platFilter = t.value; renderAdmin(); return; }
  if (n === 'plat-method') { AD.platCfg.scoreMethod = t.value; return; }
  if (n === 'imp-json-file') {
    var f = t.files && t.files[0]; if (!f) return;
    var rd = new FileReader(); rd.onload = function () { AD.imp.jsonText = String(rd.result || ''); renderAdmin(); }; rd.readAsText(f);
    return;
  }
  if (n === 'imp-ls-sapperiod') {
    var pp = (AD.imp.sapPeriods || []).filter(function (x) { return String(x.id) === t.value; })[0];
    if (pp) { AD.imp.lsForm.sapPeriod = t.value; AD.imp.lsForm.month = pp.month; AD.imp.lsForm.week = pp.week; AD.imp.lsForm.stream = impVal('imp-ls-stream'); renderAdmin(); }
  }
});
adminEl.addEventListener('click', function (ev) {
  var t = ev.target; if (!t.closest) return;
  var b;
  if ((b = t.closest('[data-tab]'))) {
    var tab = b.getAttribute('data-tab');
    var go = function () { AD.tab = tab; if (tab !== 'reports') AD.ed = null; if (tab === 'history') AD.auditLoaded = false; if (tab === 'import' || tab === 'settings') AD.imp.status = null; if (tab === 'reports') loadReports().then(renderAdmin); else renderAdmin(); };
    if (AD.ed && AD.ed.dirty && tab !== 'reports') confirmBox('Сақталмаған өзгеріс', 'Есептегі өзгеріс сақталмаған. Басқа бөлімге өтсеңіз, ол жоғалады.', [['stay', 'Қалу', 'primary'], ['go', 'Сақтамай өту', 'danger']]).then(function (a) { if (a === 'go') go(); });
    else go();
    return;
  }
  if ((b = t.closest('[data-open]'))) { var oid = b.getAttribute('data-open'); AD.tab = 'reports'; openReport(oid); return; }
  if ((b = t.closest('[data-new]'))) { newReport(b.getAttribute('data-new')); return; }
  if ((b = t.closest('[data-add]'))) { addItem(b.getAttribute('data-add')); return; }
  if ((b = t.closest('[data-del]'))) { delItem(b.getAttribute('data-del')); return; }
  if ((b = t.closest('[data-move]'))) {
    var mv = b.getAttribute('data-move').split(':'), i = +mv[0], j = i + +mv[1], arr = AD.ed.data.hardTasks;
    if (j >= 0 && j < arr.length) { var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp; AD.ed.dirty = true; renderAdmin(); }
    return;
  }
  if ((b = t.closest('[data-drop-html]'))) { var tk = AD.ed.data.hardTasks[+b.getAttribute('data-drop-html')]; tk.html = ''; tk.textEdited = true; AD.ed.dirty = true; renderAdmin(); return; }
  if ((b = t.closest('[data-clear-split]'))) { AD.ed.data.lessons[+b.getAttribute('data-clear-split')].split = {}; AD.ed.dirty = true; renderAdmin(); return; }
  if ((b = t.closest('[data-imp]'))) { var ik = b.getAttribute('data-imp'); guarded('import', function () { return runImport(ik); }); return; }
  if ((b = t.closest('[data-cat]'))) { AD.catKind = b.getAttribute('data-cat'); renderAdmin(); return; }
  if ((b = t.closest('[data-cat-save]'))) { var ck2 = b.getAttribute('data-cat-save'); guarded('cat', function () { return saveCat(ck2); }); return; }
  if ((b = t.closest('[data-cat-del]'))) {
    var did = b.getAttribute('data-cat-del');
    confirmBox('Өшіру', 'Жазба өшіріледі. Есептерде қолданылса, сервер өшірмейді — оның орнына «белсенді емес» етіңіз.', [['ok', 'Өшіру', 'danger'], ['no', 'Болдырмау']]).then(function (a) {
      if (a === 'ok') api('DELETE', '/api/catalog?kind=' + AD.catKind + '&id=' + encodeURIComponent(did)).then(reloadCatalog).then(function () { renderAdmin(); toast('Өшірілді'); }).catch(function (e) { toast(e.message, 'bad'); });
    });
    return;
  }
  if ((b = t.closest('[data-user]'))) { AD.userEdit = deep(findBy(AD.users, b.getAttribute('data-user'))); renderAdmin(); adminEl.scrollTop = 0; return; }
  if ((b = t.closest('[data-cfg-del]'))) { AD.sapCfg.agym.splice(+b.getAttribute('data-cfg-del'), 1); renderAdmin(); return; }
  if ((b = t.closest('[data-courses]'))) {
    var code = b.getAttribute('data-courses');
    var csubj = b.getAttribute('data-courses-subj');
    api('POST', '/api/import?action=platform-courses', { code: code }).then(function (x) { AD.courses = { code: code, subject: csubj, list: x.courses }; renderAdmin(); }).catch(function (e) { toast(e.message, 'bad'); });
    return;
  }
  if ((b = t.closest('[data-combo-new]'))) {
    var code = b.getAttribute('data-combo-new');
    if (!isAdmin()) { toast('Комбинацияны әкімші қосады', 'bad'); return; }
    api('POST', '/api/catalog', { kind: 'combinations', item: { code: code, name: code } }).then(reloadCatalog).then(function () { b.closest('.aCheck').innerHTML = esc(code) + ' ✓ қосылды'; toast('«' + code + '» комбинация ретінде қосылды — алдын ала қарауды қайталаңыз'); }).catch(function (e) { toast(e.message, 'bad'); });
    return;
  }
  if ((b = t.closest('[data-combo-ignore]'))) {
    var ic = b.getAttribute('data-combo-ignore');
    if (!isAdmin()) { toast('Мұны әкімші белгілейді', 'bad'); return; }
    api('GET', '/api/import').then(function (x) {
      var conf = x.sapaline.config || {}; delete conf._meta;
      conf.ignoreCodes = (conf.ignoreCodes || []).concat([ic]).filter(function (v, i, a) { return a.indexOf(v) === i; });
      return api('POST', '/api/import?action=config-sapaline', { config: conf });
    }).then(function () { AD.sapCfg = null; b.closest('.aCheck').innerHTML = esc(ic) + ' — комбинация емес'; toast('Белгіленді'); }).catch(function (e) { toast(e.message, 'bad'); });
    return;
  }
  if ((b = t.closest('[data-course-del]'))) { courseList(b.getAttribute('data-course-del')).splice(+b.getAttribute('data-ci'), 1); renderAdmin(); return; }
  if ((b = t.closest('[data-course-manual-add]'))) {
    var mk = b.getAttribute('data-course-manual-add'), inpEl = $('[data-course-manual="' + mk + '"]', adminEl), mid = inpEl && inpEl.value.trim();
    if (mid) { var ml = courseList(mk); ml.push({ courseId: mid, courseName: '', comboId: null }); AD.platCfg.courses[mk] = ml; renderAdmin(); }
    return;
  }
  if ((b = t.closest('[data-agym-add]'))) {
    AD.sapCfg.agym.push({ agym: b.getAttribute('data-agym-add'), stream: b.getAttribute('data-agym-stream'), combos: [] });
    renderAdmin(); toast('Қосылды — комбинациясын белгілеп, «SapaLine баптауын сақтау» басыңыз'); return;
  }
  if ((b = t.closest('[data-course]'))) {
    var ck = b.getAttribute('data-course-key'), cl = courseList(ck), cid = b.getAttribute('data-course');
    if (cl.some(function (x) { return x.courseId === cid; })) { toast('Бұл курс бұрыннан тіркелген'); return; }
    cl.push({ courseId: cid, courseName: b.getAttribute('data-course-name'), comboId: null });
    AD.platCfg.courses[ck] = cl;
    AD.platFilter = ck.split('.')[0];
    renderAdmin(); toast('Курс тіркелді — «Платформа баптауын сақтау» басыңыз'); return;
  }
  if ((b = t.closest('[data-a]'))) {
    var a = b.getAttribute('data-a');
    if (a === 'all-combos') { AD.allCombos = !AD.allCombos; renderAdmin(); return; }
    if (a === 'fill-weeks') {
      var fs = impVal('fill-stream'), fm = +impVal('fill-month'), fw = +impVal('fill-weeks');
      AD.fillStream = fs; AD.fillMonth = impVal('fill-month'); AD.fillWeeks = impVal('fill-weeks');
      if (!(fm >= 1 && fw >= 1 && fw <= 10)) { toast('Оқу айы мен апта санын (1–10) жазыңыз', 'bad'); return; }
      var have = (cat().periods || []).filter(function (p) { return p.stream_id === fs && p.kind === 'week' && p.month === fm; }).map(function (p) { return p.week; });
      var todo = []; for (var wk = 1; wk <= fw; wk++) if (have.indexOf(wk) < 0) todo.push(wk);
      guarded('fill', function () {
        return todo.reduce(function (pr, wk) { return pr.then(function () { return api('POST', '/api/catalog', { kind: 'periods', item: { stream_id: fs, kind: 'week', month: fm, week: wk } }); }); }, Promise.resolve())
          .then(reloadCatalog).then(function () { renderAdmin(); toast(todo.length ? todo.length + ' апта қосылды' : 'Бұл айдың апталары бұрыннан бар'); }).catch(function (e) { toast(e.message, 'bad'); });
      });
      return;
    }
    if (a === 'plat-subjects') { api('POST', '/api/import?action=platform-subjects', {}).then(function (x) { AD.platSubjects = x.subjects; renderAdmin(); }).catch(function (e) { toast(e.message, 'bad'); }); return; }
    if (a === 'plat-codes-save') {
      var jobs = $$('[data-plat-code]', adminEl).map(function (el) {
        var sid = el.getAttribute('data-plat-code'), cur = findBy(cat().subjects, sid);
        if ((cur.platform_code || '') === el.value) return null;
        return api('POST', '/api/catalog', { kind: 'subjects', item: { id: sid, platform_code: el.value } });
      }).filter(Boolean);
      Promise.all(jobs).then(reloadCatalog).then(function () { renderAdmin(); toast('Пән кодтары сақталды: ' + jobs.length); }).catch(function (e) { toast(e.message, 'bad'); });
      return;
    }
    if (a === 'site') { closeAdmin(); return; }
    if (a === 'back') {
      var back = function () { AD.ed = null; loadReports().then(renderAdmin); };
      if (AD.ed && AD.ed.dirty) confirmBox('Сақталмаған өзгеріс', 'Өзгеріс сақталмаған. Тізімге оралсаңыз, ол жоғалады.', [['stay', 'Қалу', 'primary'], ['go', 'Сақтамай оралу', 'danger']]).then(function (x) { if (x === 'go') back(); });
      else back();
      return;
    }
    if (a === 'save' || a === 'publish') { guarded('save', function () { return saveReport(a === 'publish'); }); return; }
    if (['preview', 'unpublish', 'delete', 'revisions'].indexOf(a) >= 0) { reportAction(a); return; }
    if (a === 'bt-all-subjects') {
      var sid = AD.ed.isNew ? AD.ed.meta.stream_id : AD.ed.report.stream_id;
      var have = (AD.ed.data.subjects || []).map(function (s) { return s.subjectId; });
      var add = cat().assignments.filter(function (x) { return x.stream_id === sid && have.indexOf(x.subject_id) < 0; }).map(function (x) { return x.subject_id; });
      add.filter(function (x, i) { return add.indexOf(x) === i; }).forEach(function (s) {
        var subj = subjOf(s);
        (AD.ed.data.subjects = AD.ed.data.subjects || []).push({ subjectId: s, avg: '', max: subj && subj.max_scores && subj.max_scores.bt != null ? subj.max_scores.bt : '', participants: '', top3: [], hardTopics: [], recommendation: '' });
      });
      if (!sid) toast('Алдымен ағымды таңдаңыз', 'bad');
      AD.ed.dirty = true; renderAdmin(); return;
    }
    if (a === 'user-save') { guarded('user', saveUser); return; }
    if (a === 'user-new') { AD.userEdit = null; renderAdmin(); return; }
    if (a === 'agym-add') { AD.sapCfg.agym.push({ agym: '', stream: 'sp1', combos: [] }); renderAdmin(); return; }
    if (a === 'sap-save' || a === 'plat-save') {
      var isSap = a === 'sap-save';
      var conf = deep(isSap ? AD.sapCfg : AD.platCfg);
      if (!isSap) conf.hardTaskLimit = Number(conf.hardTaskLimit) || 10;
      api('POST', '/api/import?action=' + (isSap ? 'config-sapaline' : 'config-platform'), { config: conf }).then(function () { AD.imp.status = null; AD.sapCfg = null; AD.platCfg = null; renderAdmin(); toast('Баптау сақталды'); }).catch(function (e) { toast(e.message, 'bad'); });
      return;
    }
    if (a === 'discover') {
      api('POST', '/api/import?action=sapaline-discover', { division: Object.keys(AD.sapCfg.divisions || {}).map(function (k) { return AD.sapCfg.divisions[k]; }).filter(Boolean)[0] || '' }).then(function (x) { AD.discover = x; renderAdmin(); }).catch(function (e) { toast(e.message, 'bad'); });
      return;
    }
  }
});
