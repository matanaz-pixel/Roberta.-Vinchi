// דף המלצרים: צפייה בלבד. הנתונים מ-Firebase (צומת menu), עם גיבוי מקובץ menu-data.json ומהמטמון האחרון בטלפון.
(function () {
  const L = window.MenuLib;
  const $ = (s, r) => (r || document).querySelector(s);
  let lastFocus = null;
  const state = { menu: { categories: [], items: [] }, cat: 'all', q: '', avoid: new Set(), vegan: false, open: null };

  // esc ו-safePhoto מגיעים מ-firebase-init.js; אם הוא לא נטען (אופליין) נשתמש בגרסה מקומית
  const escf = typeof esc === 'function' ? esc : v => String(v == null ? '' : v).replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
  function imgSrc(p) {
    if (typeof p !== 'string') return '';
    if (/^img\/[\w.-]+\.webp$/.test(p)) return p;
    if (/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+\/=]+$/.test(p)) return p;
    if (/^https:\/\/[^\s"'<>()\\]+$/.test(p)) return p;
    return '';
  }

  function setMenu(raw, fromCache) {
    state.menu = L.normalizeMenu(raw);
    $('#status').hidden = true;
    render();
    if (!fromCache) {
      try { localStorage.setItem('menu_cache_v1', JSON.stringify(raw)); } catch (e) {}
    }
  }

  function loadFallback() {
    return fetch('menu-data.json', { cache: 'no-cache' }).then(r => r.json()).then(seed => {
      // קובץ ההתחלה הוא מערך; ממירים לצורת Firebase
      const o = { categories: {}, items: {} };
      seed.categories.forEach(c => (o.categories[c.id] = c));
      seed.items.forEach(i => (o.items[i.id] = i));
      return o;
    });
  }

  function init() {
    let got = false;
    // מטמון מקומי קודם: כך הדף עולה מיד גם בלי קליטה
    try {
      const c = JSON.parse(localStorage.getItem('menu_cache_v1') || 'null');
      if (c && c.items) { setMenu(c, true); got = true; }
    } catch (e) {}
    const fallback = () => { if (!got) loadFallback().then(o => { got = true; setMenu(o, true); }).catch(showError); };
    // אם ספריית Firebase לא נטענה, firebase-init.js נופל באמצע ו-db נשאר באזור מת (TDZ), ולכן try
    let hasDb = false;
    try { hasDb = typeof db !== 'undefined' && !!db; } catch (e) {}
    if (hasDb) {
      db.ref('menu').on('value', snap => {
        const v = snap.val();
        if (v && v.items) { got = true; setMenu(v); } else fallback();
      }, fallback);
      setTimeout(() => { if (!got) fallback(); }, 4000);
    } else fallback();
  }

  function showError() {
    const s = $('#status');
    s.hidden = false;
    s.textContent = 'לא הצלחתי לטעון את התפריט. בדוק חיבור לאינטרנט ורענן.';
  }

  // ---------- תצוגה ----------
  function tagsFor(it) {
    const out = [];
    if (it.vegan) out.push('<span class="tag vegan">טבעוני</span>');
    ['gluten', 'lactose'].forEach(k => {
      const s = L.status(it, k);
      if (s === 'has') out.push('<span class="tag has">' + L.ALLERGEN_LABEL[k] + '</span>');
      else if (s === 'option') out.push('<span class="tag opt">' + L.ALLERGEN_LABEL[k] + ' (אפשר בלי)</span>');
    });
    return out.join('');
  }

  function cardHtml(it) {
    const src = imgSrc(it.image);
    return '<button class="card" data-id="' + escf(it.id) + '">' +
      '<span class="pic">' + (src ? '<img loading="lazy" decoding="async" alt="" src="' + escf(src) + '">' : '<span class="noimg">אין תמונה</span>') + '</span>' +
      '<span class="body"><span class="row"><span class="name">' + escf(it.name) + '</span><span class="price">' + escf(it.price) + ' ₪</span></span>' +
      '<span class="tags">' + tagsFor(it) + '</span></span></button>';
  }

  function renderChips() {
    // רק קטגוריות שיש בהן מנה מוצגת
    const cats = state.menu.categories.filter(c => state.menu.items.some(i => i.cat === c.id && i.visible !== false));
    const box = $('#cats');
    box.innerHTML = '<button class="chip' + (state.cat === 'all' ? ' on' : '') + '" data-cat="all">הכל</button>' +
      cats.map(c => '<button class="chip' + (state.cat === c.id ? ' on' : '') + '" data-cat="' + escf(c.id) + '">' + escf(c.short || c.name) + '</button>').join('');
  }

  function renderFilters() {
    const box = $('#allergens');
    box.innerHTML = '<button class="chip small' + (state.vegan ? ' on' : '') + '" data-vegan="1">רק טבעוני</button>' +
      L.ALLERGENS.map(a => '<button class="chip small' + (state.avoid.has(a.key) ? ' on' : '') + '" data-avoid="' + a.key + '">בלי ' + a.label + '</button>').join('');
    const n = state.avoid.size + (state.vegan ? 1 : 0);
    $('#filterBtn').textContent = n ? 'סינון אלרגנים (' + n + ')' : 'סינון אלרגנים';
    $('#filterBtn').classList.toggle('on', n > 0);
  }

  function render() {
    renderChips();
    renderFilters();
    const list = L.filterItems(state.menu.items, { cat: state.cat, q: state.q, avoid: [...state.avoid], vegan: state.vegan });
    const main = $('#list');
    if (!list.length) {
      main.innerHTML = '<p class="empty">לא נמצאו מנות. אפשר לנקות את החיפוש או את הסינון.</p>';
      return;
    }
    let html = '';
    state.menu.categories.forEach(c => {
      const its = list.filter(i => i.cat === c.id);
      if (!its.length) return;
      html += '<section><h2>' + escf(c.name) + '</h2><div class="grid">' + its.map(cardHtml).join('') + '</div></section>';
    });
    main.innerHTML = html;
  }

  function sheetRow(title, html) {
    return html ? '<div class="blk"><h3>' + title + '</h3>' + html + '</div>' : '';
  }

  function openSheet(id) {
    const it = state.menu.items.find(x => x.id === id);
    if (!it) return;
    state.open = id;
    lastFocus = document.activeElement;
    const src = imgSrc(it.image);
    const al = [];
    L.ALLERGENS.forEach(a => {
      const s = L.status(it, a.key);
      if (s === 'has') al.push('<span class="tag has big">' + a.label + '</span>');
      else if (s === 'option') al.push('<span class="tag opt big">' + a.label + ' (אפשר בלי)</span>');
      else if (s === 'free' && (a.key === 'gluten' || a.key === 'lactose')) al.push('<span class="tag ok big">בלי ' + a.label + '</span>');
    });
    if (it.vegan) al.unshift('<span class="tag vegan big">טבעוני</span>');
    const notes = (it.notes || []).map(n => '<li>' + escf(n) + '</li>').join('');
    const preg = (it.pregnancy || []).map(n => '<li>' + escf(n) + '</li>').join('');
    const gnote = [it.glutenNote && 'גלוטן: ' + it.glutenNote, it.lactoseNote && 'לקטוז: ' + it.lactoseNote].filter(Boolean).map(n => '<li>' + escf(n) + '</li>').join('');
    $('#sheetBody').innerHTML =
      (src ? '<img class="hero" alt="" src="' + escf(src) + '">' : '') +
      '<div class="inner"><div class="row"><h2>' + escf(it.name) + '</h2><span class="price">' + escf(it.price) + ' ₪</span></div>' +
      '<p class="desc">' + escf(it.desc) + '</p>' +
      sheetRow('אלרגנים', al.length ? '<div class="tags">' + al.join('') + '</div>' + (gnote ? '<ul>' + gnote + '</ul>' : '') : '') +
      sheetRow('שינויים אפשריים', it.mods ? '<p>' + escf(it.mods) + '</p>' : '') +
      sheetRow('היריון', preg ? '<ul>' + preg + '</ul>' : '') +
      sheetRow('הערות למלצר', notes ? '<ul>' + notes + '</ul>' : '') +
      '<p class="fine">אלרגנים מעבר לגלוטן ולקטוז זוהו לפי רשימת המרכיבים. בכל ספק, שאלו את המטבח.</p></div>';
    $('#sheet').hidden = false;
    document.body.classList.add('lock');
    $('#sheetScroll').scrollTop = 0;
    $('#sheetClose').focus();
  }

  function closeSheet() {
    $('#sheet').hidden = true;
    document.body.classList.remove('lock');
    state.open = null;
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) { if (e.target.id === 'sheet') closeSheet(); return; }
    if (t.dataset.cat) { state.cat = t.dataset.cat; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else if (t.dataset.avoid) { const k = t.dataset.avoid; state.avoid.has(k) ? state.avoid.delete(k) : state.avoid.add(k); render(); }
    else if (t.dataset.vegan) { state.vegan = !state.vegan; render(); }
    else if (t.classList.contains('card')) openSheet(t.dataset.id);
    else if (t.id === 'sheetClose') closeSheet();
    else if (t.id === 'filterBtn') { const p = $('#allergens'); p.hidden = !p.hidden; t.setAttribute('aria-expanded', String(!p.hidden)); }
    else if (t.id === 'clear') { state.avoid.clear(); state.vegan = false; state.q = ''; state.cat = 'all'; $('#q').value = ''; render(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.open) closeSheet(); });
  $('#q').addEventListener('input', e => { state.q = e.target.value; render(); });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('menu-sw.js').catch(() => {});
  init();
})();
