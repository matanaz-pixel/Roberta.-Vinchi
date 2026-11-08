// דף המלצרים: צפייה בלבד. דף אחד ארוך עם כל המנות לפי הסדר וכל הפרטים גלויים.
// הנתונים מ-Firebase (צומת menu), עם גיבוי מקובץ menu-data.json ומהמטמון האחרון בטלפון.
(function () {
  const L = window.MenuLib;
  const $ = (s, r) => (r || document).querySelector(s);
  const state = { menu: { categories: [], items: [] }, q: '', avoid: new Set(), vegan: false };

  // esc מגיע מ-firebase-init.js; אם הוא לא נטען (אופליין) נשתמש בגרסה מקומית
  const escf = typeof esc === 'function' ? esc : v => String(v == null ? '' : v).replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
  function imgSrc(p) {
    if (typeof p !== 'string') return '';
    if (/^img\/[\w.-]+\.webp$/.test(p)) return p;
    if (/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+\/=]+$/.test(p)) return p;
    if (/^https:\/\/[^\s"'<>()\\]+$/.test(p)) return p;
    return '';
  }

  // ---------- נתונים ----------
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
    $('#list').innerHTML = '';
  }

  // ---------- תצוגה ----------
  function tags(it) {
    const out = [];
    if (it.vegan) out.push('<span class="tag vegan">טבעונית</span>');
    L.ALLERGENS.forEach(a => {
      const s = L.status(it, a.key);
      if (s === 'has') out.push('<span class="tag has">' + a.label + '</span>');
      else if (s === 'option') out.push('<span class="tag opt">' + a.label + ' (אפשר בלי)</span>');
      else if (s === 'free' && (a.key === 'gluten' || a.key === 'lactose')) out.push('<span class="tag ok">בלי ' + a.label + '</span>');
      else if (s === 'unknown') out.push('<span class="tag unk">' + a.label + ' לא סומן, לשאול את המטבח</span>');
    });
    return out.join('');
  }
  const blk = (title, html) => (html ? '<div class="blk"><h4>' + title + '</h4>' + html + '</div>' : '');
  const li = arr => (arr.length ? '<ul>' + arr.map(n => '<li>' + escf(n) + '</li>').join('') + '</ul>' : '');

  function dishHtml(it) {
    const src = imgSrc(it.image);
    const gnotes = [it.glutenNote && 'גלוטן: ' + it.glutenNote, it.lactoseNote && 'לקטוז: ' + it.lactoseNote].filter(Boolean);
    return '<article class="dish" id="' + escf(it.id) + '">' +
      (src ? '<img class="hero" loading="lazy" decoding="async" alt="" src="' + escf(src) + '">' : '<div class="noimg">אין תמונה</div>') +
      '<div class="inner"><div class="row"><h3 class="name">' + escf(it.name) + '</h3><span class="price">' + escf(it.price) + ' ₪</span></div>' +
      '<div class="tags">' + tags(it) + '</div>' +
      '<p class="desc">' + escf(it.desc) + '</p>' +
      blk('הערות על אלרגנים', li(gnotes)) +
      blk('שינויים אפשריים', it.mods ? '<p>' + escf(it.mods) + '</p>' : '') +
      blk('היריון', li(it.pregnancy || [])) +
      blk('הערות למלצר', li(it.notes || [])) +
      '</div></article>';
  }

  function renderFilters() {
    $('#allergens').innerHTML = '<button class="chip small' + (state.vegan ? ' on' : '') + '" data-vegan="1">רק טבעוני</button>' +
      L.ALLERGENS.map(a => '<button class="chip small' + (state.avoid.has(a.key) ? ' on' : '') + '" data-avoid="' + a.key + '">בלי ' + a.label + '</button>').join('');
    const n = state.avoid.size + (state.vegan ? 1 : 0) + (state.q.trim() ? 1 : 0);
    $('#filterBtn').textContent = n ? 'חיפוש וסינון (' + n + ')' : 'חיפוש וסינון';
    $('#filterBtn').classList.toggle('on', n > 0);
  }

  function render() {
    renderFilters();
    const f = L.filterItems(state.menu.items, { q: state.q, avoid: [...state.avoid], vegan: state.vegan });
    const cats = state.menu.categories.filter(c => f.some(i => i.cat === c.id));
    const list = $('#list');
    if (!f.length) {
      list.innerHTML = '<p class="empty">לא נמצאו מנות. אפשר לנקות את החיפוש או את הסינון.</p>';
    } else {
      list.innerHTML = cats.map(c =>
        '<section class="cat" id="cat-' + escf(c.id) + '"><h2 class="cat-title">' + escf(c.name) + '</h2>' +
        f.filter(i => i.cat === c.id).map(dishHtml).join('') + '</section>').join('') +
        '<p class="fine">אלרגנים מעבר לגלוטן ולקטוז זוהו לפי רשימת המרכיבים. בכל ספק, שאלו את המטבח.</p>';
    }
    $('#cats').innerHTML = cats.map(c => '<button class="chip" data-cat="' + escf(c.id) + '">' + escf(c.short || c.name) + '</button>').join('');
    markActive();
  }

  // הקטגוריה שבה נמצא הקורא מסומנת בכפתורים
  function markActive() {
    const secs = [...document.querySelectorAll('section.cat')];
    let cur = secs[0];
    secs.forEach(s => { if (s.getBoundingClientRect().top <= 140) cur = s; });
    document.querySelectorAll('#cats .chip').forEach(b => {
      const on = !!cur && b.dataset.cat === cur.id.slice(4);
      const was = b.classList.contains('on');
      b.classList.toggle('on', on);
      // כשהקטגוריה משתנה בגלילה, מזיזים רק את שורת הכפתורים ולא את הדף
      if (on && !was) { const box = $('#cats'); box.scrollTo({ left: b.offsetLeft - box.clientWidth / 2 + b.offsetWidth / 2 - box.offsetLeft, behavior: 'smooth' }); }
    });
    $('#top').hidden = window.scrollY < 600;
  }
  let tick = 0;
  window.addEventListener('scroll', () => { if (!tick) tick = requestAnimationFrame(() => { tick = 0; markActive(); }); }, { passive: true });

  // ---------- אירועים ----------
  document.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.cat) { const s = document.getElementById('cat-' + t.dataset.cat); if (s) s.scrollIntoView({ block: 'start' }); }
    else if (t.dataset.avoid) { const k = t.dataset.avoid; state.avoid.has(k) ? state.avoid.delete(k) : state.avoid.add(k); render(); }
    else if (t.dataset.vegan) { state.vegan = !state.vegan; render(); }
    else if (t.id === 'filterBtn') { const p = $('#panel'); p.hidden = !p.hidden; t.setAttribute('aria-expanded', String(!p.hidden)); if (!p.hidden) $('#q').focus(); }
    else if (t.id === 'clear') { state.avoid.clear(); state.vegan = false; state.q = ''; $('#q').value = ''; render(); }
    else if (t.id === 'top') window.scrollTo({ top: 0 });
  });
  $('#q').addEventListener('input', e => { state.q = e.target.value; render(); });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('menu-sw.js').catch(() => {});
  init();
})();
