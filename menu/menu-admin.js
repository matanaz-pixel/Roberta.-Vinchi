// דף העריכה: בלי שרת ובלי כניסה. עורכים בדפדפן (הטיוטה נשמרת אוטומטית בדפדפן הזה), מורידים menu-data.json ומחליפים אותו באתר.
// מה שעושים כאן לא משפיע על המלצרים עד שמחליפים את הקובץ.
(function () {
  const L = window.MenuLib;
  const $ = (s, r) => (r || document).querySelector(s);
  const escf = v => String(v == null ? '' : v).replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
  const DRAFT = 'menu_draft_v1';
  const S = { cats: [], items: [], draft: false, tab: 'items', editing: null };

  function imgSrc(p) {
    if (typeof p !== 'string') return '';
    if (/^img\/[\w.-]+\.webp$/.test(p)) return p;
    if (/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+\/=]+$/.test(p)) return p;
    return '';
  }
  function toast(msg, bad) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toast.h);
    toast.h = setTimeout(() => (t.className = ''), 3500);
  }
  // כל שינוי נשמר מיד כטיוטה בדפדפן
  function touch() {
    S.draft = true;
    try { localStorage.setItem(DRAFT, JSON.stringify(L.toExport(S.cats, S.items))); $('#draftNote').hidden = false; }
    catch (e) { toast('אין מקום לשמור טיוטה בדפדפן. הורד קובץ עכשיו.', true); }
  }

  // ---------- טעינה ----------
  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch (e) {}
    if (d && d.items) {
      const m = L.normalizeMenu(d);
      S.cats = m.categories; S.items = m.items; S.draft = true;
      $('#draftNote').hidden = false;
      render();
      return;
    }
    fetch('menu-data.json', { cache: 'no-cache' }).then(r => r.json()).then(seed => {
      const m = L.normalizeMenu(seed);
      S.cats = m.categories; S.items = m.items; render();
    }).catch(err => toast('הטעינה נכשלה: ' + err.message, true));
  }

  // ---------- תצוגה ----------
  function render() {
    $('#tabItems').classList.toggle('on', S.tab === 'items');
    $('#tabCats').classList.toggle('on', S.tab === 'cats');
    $('#paneItems').hidden = S.tab !== 'items';
    $('#paneCats').hidden = S.tab !== 'cats';
    renderItems();
    renderCats();
  }

  function renderItems() {
    let html = '';
    S.cats.slice().sort((a, b) => a.order - b.order).forEach(c => {
      const its = S.items.filter(i => i.cat === c.id).sort((a, b) => a.order - b.order);
      html += '<section><div class="sechead"><h2>' + escf(c.name) + ' <small>' + its.length + '</small></h2><button class="btn small" data-add="' + escf(c.id) + '">+ מנה</button></div>';
      its.forEach((it, idx) => {
        const src = imgSrc(it.image);
        html += '<div class="item' + (it.visible === false ? ' hidden' : '') + '" data-id="' + escf(it.id) + '">' +
          '<span class="thumb">' + (src ? '<img alt="" src="' + escf(src) + '">' : '') + '</span>' +
          '<button class="main" data-edit="' + escf(it.id) + '"><b>' + escf(it.name) + '</b><span>' + escf(it.price) + ' ₪' + (it.visible === false ? ' · מוסתרת' : '') + '</span></button>' +
          '<span class="ctl">' +
          '<button class="ic" data-up="' + escf(it.id) + '" aria-label="הזז למעלה"' + (idx === 0 ? ' disabled' : '') + '>▲</button>' +
          '<button class="ic" data-down="' + escf(it.id) + '" aria-label="הזז למטה"' + (idx === its.length - 1 ? ' disabled' : '') + '>▼</button>' +
          '<button class="ic" data-eye="' + escf(it.id) + '" aria-label="הצג או הסתר">' + (it.visible === false ? '🚫' : '👁') + '</button></span></div>';
      });
      html += '</section>';
    });
    $('#paneItems').innerHTML = html || '<p class="muted">אין מנות עדיין.</p>';
  }

  function renderCats() {
    const cats = S.cats.slice().sort((a, b) => a.order - b.order);
    $('#paneCats').innerHTML = cats.map((c, i) =>
      '<div class="catrow"><input data-catname="' + escf(c.id) + '" value="' + escf(c.name) + '" aria-label="שם קטגוריה">' +
      '<input data-catshort="' + escf(c.id) + '" value="' + escf(c.short || c.name) + '" aria-label="שם קצר" class="short">' +
      '<button class="ic" data-catup="' + escf(c.id) + '"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
      '<button class="ic" data-catdown="' + escf(c.id) + '"' + (i === cats.length - 1 ? ' disabled' : '') + '>▼</button>' +
      '<button class="ic" data-catdel="' + escf(c.id) + '" aria-label="מחיקה">🗑</button></div>').join('') +
      '<button class="btn" id="addCat">+ קטגוריה חדשה</button>' +
      '<p class="muted">השם הקצר מוצג על כפתורי הסינון בדף המלצרים. אפשר למחוק רק קטגוריה ריקה.</p>';
  }

  // ---------- עריכת מנה ----------
  const f = id => $('#f_' + id);
  function openEdit(id, catForNew) {
    let it = S.items.find(x => x.id === id);
    const isNew = !it;
    if (isNew) {
      it = { id: L.nextId(S.items), cat: catForNew || (S.cats[0] && S.cats[0].id), name: '', price: '', desc: '', gluten: 'unknown', lactose: 'unknown', vegan: false, glutenNote: '', lactoseNote: '', mods: '', notes: [], pregnancy: [], allergens: [], image: '', visible: true, order: 999 };
    }
    S.editing = { id: it.id, isNew, image: it.image || '' };
    f('name').value = it.name; f('price').value = it.price; f('desc').value = it.desc || '';
    f('cat').innerHTML = S.cats.map(c => '<option value="' + escf(c.id) + '"' + (c.id === it.cat ? ' selected' : '') + '>' + escf(c.name) + '</option>').join('');
    f('gluten').value = it.gluten; f('lactose').value = it.lactose;
    f('glutenNote').value = it.glutenNote || ''; f('lactoseNote').value = it.lactoseNote || '';
    f('vegan').checked = !!it.vegan; f('visible').checked = it.visible !== false;
    f('mods').value = it.mods || ''; f('notes').value = (it.notes || []).join('\n'); f('pregnancy').value = (it.pregnancy || []).join('\n');
    $('#otherAl').innerHTML = L.ALLERGENS.filter(a => a.key !== 'gluten' && a.key !== 'lactose').map(a =>
      '<label class="chk"><input type="checkbox" data-al="' + a.key + '"' + (it.allergens.indexOf(a.key) >= 0 ? ' checked' : '') + '> ' + a.label + '</label>').join('');
    $('#delItem').hidden = isNew;
    $('#editTitle').textContent = isNew ? 'מנה חדשה' : 'עריכת מנה';
    showPreview();
    $('#editErr').textContent = '';
    $('#edit').hidden = false;
    document.body.classList.add('lock');
    $('#editScroll').scrollTop = 0;
    f('name').focus();
  }
  function showPreview() {
    const src = imgSrc(S.editing.image);
    $('#preview').innerHTML = src ? '<img alt="" src="' + escf(src) + '">' : '<span>אין תמונה</span>';
    $('#rmImg').hidden = !src;
  }
  function closeEdit() { $('#edit').hidden = true; document.body.classList.remove('lock'); S.editing = null; }

  function saveEdit() {
    const e = S.editing;
    const old = S.items.find(x => x.id === e.id) || {};
    const lines = v => v.split('\n').map(s => s.trim()).filter(Boolean);
    const it = Object.assign({}, old, {
      id: e.id, cat: f('cat').value, name: f('name').value.trim(), price: f('price').value.trim() === '' ? '' : Number(f('price').value),
      desc: f('desc').value.trim(), gluten: f('gluten').value, lactose: f('lactose').value,
      glutenNote: f('glutenNote').value.trim(), lactoseNote: f('lactoseNote').value.trim(),
      vegan: f('vegan').checked, visible: f('visible').checked, mods: f('mods').value.trim(),
      notes: lines(f('notes').value), pregnancy: lines(f('pregnancy').value), image: e.image,
      allergens: [].concat(it_gl(f('gluten').value, 'gluten'), it_gl(f('lactose').value, 'lactose'), [...document.querySelectorAll('#otherAl input:checked')].map(x => x.dataset.al))
    });
    const errs = L.validateItem(it);
    if (errs.length) { $('#editErr').textContent = errs.join(' · '); return; }
    if (e.isNew) { it.order = 999; S.items.push(it); }
    else if (old.cat !== it.cat) { it.order = 999; S.items = S.items.map(x => (x.id === it.id ? it : x)); }
    else S.items = S.items.map(x => (x.id === it.id ? it : x));
    S.items = L.renumber(S.items);
    closeEdit(); touch(); render();
  }
  function it_gl(v, key) { return v === 'yes' ? [key] : []; }

  // תמונה: מקטינים בדפדפן ל-800px ושומרים כ-webp, כדי שלא יעלה קובץ כבד לטלפון של המלצר
  function handleFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 800, r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let data = c.toDataURL('image/webp', 0.8);
      if (data.indexOf('data:image/webp') !== 0) data = c.toDataURL('image/jpeg', 0.8);
      if (data.length > 400000) { $('#editErr').textContent = 'התמונה כבדה מדי גם אחרי הקטנה. נסה תמונה אחרת.'; return; }
      S.editing.image = data; showPreview(); $('#editErr').textContent = '';
    };
    img.onerror = () => { URL.revokeObjectURL(url); $('#editErr').textContent = 'לא הצלחתי לקרוא את התמונה'; };
    img.src = url;
  }

  // ---------- הורדת הקובץ ----------
  function download() {
    const bad = S.items.map(i => ({ i, e: L.validateItem(i) })).find(x => x.e.length);
    if (bad) { toast('יש מנה לא תקינה: ' + bad.i.name + ' (' + bad.e.join(', ') + ')', true); return; }
    const json = JSON.stringify(L.toExport(S.cats, S.items), null, 1);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'menu-data.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('הקובץ ירד. כדי שהמלצרים יראו את השינויים, החלף בו את menu/menu-data.json באתר.');
  }
  function resetDraft() {
    if (!confirm('לזרוק את כל השינויים ולחזור לתפריט שבאתר?')) return;
    try { localStorage.removeItem(DRAFT); } catch (e) {}
    S.draft = false; $('#draftNote').hidden = true; load();
  }

  // ---------- אירועים ----------
  document.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (d.edit) openEdit(d.edit);
    else if (d.add) openEdit(null, d.add);
    else if (d.up || d.down) { S.items = L.moveItem(S.items, d.up || d.down, d.up ? -1 : 1); touch(); renderItems(); }
    else if (d.eye) { S.items = S.items.map(x => (x.id === d.eye ? Object.assign({}, x, { visible: x.visible === false }) : x)); touch(); renderItems(); }
    else if (d.catup || d.catdown) { S.cats = L.moveCategory(S.cats, d.catup || d.catdown, d.catup ? -1 : 1); touch(); render(); }
    else if (d.catdel) {
      if (S.items.some(i => i.cat === d.catdel)) toast('אי אפשר למחוק קטגוריה שיש בה מנות. העבר אותן קודם.', true);
      else if (confirm('למחוק את הקטגוריה?')) { S.cats = S.cats.filter(c => c.id !== d.catdel).map((c, i) => Object.assign({}, c, { order: i + 1 })); touch(); render(); }
    }
    else if (t.id === 'addCat') { const n = S.cats.length + 1; S.cats.push({ id: 'c' + Date.now().toString(36), name: 'קטגוריה חדשה', short: 'חדשה', order: n }); touch(); render(); }
    else if (t.id === 'tabItems') { S.tab = 'items'; render(); }
    else if (t.id === 'tabCats') { S.tab = 'cats'; render(); }
    else if (t.id === 'download') download();
    else if (t.id === 'resetDraft') resetDraft();
    else if (t.id === 'saveItem') saveEdit();
    else if (t.id === 'cancelItem') closeEdit();
    else if (t.id === 'rmImg') { S.editing.image = ''; showPreview(); }
    else if (t.id === 'delItem') {
      if (confirm('למחוק את המנה לצמיתות? אפשר גם רק להסתיר אותה.')) { S.items = L.renumber(S.items.filter(x => x.id !== S.editing.id)); closeEdit(); touch(); render(); }
    }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset && t.dataset.catname) { S.cats = S.cats.map(c => (c.id === t.dataset.catname ? Object.assign({}, c, { name: t.value }) : c)); touch(); }
    else if (t.dataset && t.dataset.catshort) { S.cats = S.cats.map(c => (c.id === t.dataset.catshort ? Object.assign({}, c, { short: t.value }) : c)); touch(); }
  });
  $('#file').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.editing) closeEdit(); });
  load();
})();
