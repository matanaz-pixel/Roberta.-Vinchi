// דף המלצרים: צפייה בלבד. דף אחד ארוך עם כל המנות לפי הסדר וכל הפרטים גלויים.
// הנתונים מקובץ menu-data.json. ב-?preview מוצגת הטיוטה מדף העריכה (באותו דפדפן), כדי לראות לפני שמחליפים את הקובץ.
(function () {
  const L = window.MenuLib;
  const $ = (s, r) => (r || document).querySelector(s);
  const state = { menu: { categories: [], items: [] } };

  // הגנה מפני הזרקת HTML: כל טקסט מהקובץ עובר escape לפני שנכנס ל-innerHTML
  const escf = v => String(v == null ? '' : v).replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
  function imgSrc(p) {
    if (typeof p !== 'string') return '';
    if (/^img\/[\w.-]+\.webp$/.test(p)) return p;
    if (/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+\/=]+$/.test(p)) return p;
    if (/^https:\/\/[^\s"'<>()\\]+$/.test(p)) return p;
    return '';
  }

  // ---------- נתונים ----------
  const PREVIEW = /[?&]preview\b/.test(location.search);
  function setMenu(raw) {
    state.menu = L.normalizeMenu(raw);
    $('#status').hidden = !PREVIEW;
    if (PREVIEW) $('#status').textContent = 'תצוגה מקדימה של הטיוטה מדף העריכה. המלצרים עדיין לא רואים את זה.';
    render();
  }
  function draft() {
    try { const d = JSON.parse(localStorage.getItem('menu_draft_v1') || 'null'); return d && d.items ? d : null; } catch (e) { return null; }
  }
  function load() {
    if (PREVIEW && draft()) return setMenu(draft());
    fetch('menu-data.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(setMenu).catch(showError);
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

  function render() {
    const f = L.filterItems(state.menu.items, {});
    const cats = state.menu.categories.filter(c => f.some(i => i.cat === c.id));
    const list = $('#list');
    if (!f.length) {
      list.innerHTML = '<p class="empty">אין מנות להצגה.</p>';
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
    else if (t.id === 'top') window.scrollTo({ top: 0 });
  });

  // בתצוגה מקדימה, כל שינוי בדף העריכה מתעדכן כאן מיד
  if (PREVIEW) window.addEventListener('storage', e => { if (e.key === 'menu_draft_v1' && draft()) setMenu(draft()); });
  if (!PREVIEW && 'serviceWorker' in navigator) navigator.serviceWorker.register('menu-sw.js').catch(() => {});
  load();
})();
