// לוגיקה משותפת לדף המלצרים ולדף המנהל של ספר המנות. בלי תלות ב-DOM, כדי שאפשר לבדוק ב-node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MenuLib = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // אלרגנים שמסומנים במנה. gluten ו-lactose נקבעים לפי הסימון בקובץ, השאר זוהו מהתיאור ואפשר לתקן במנהל.
  const ALLERGENS = [
    { key: 'gluten', label: 'גלוטן' },
    { key: 'lactose', label: 'לקטוז' },
    { key: 'nuts', label: 'אגוזים' },
    { key: 'fish', label: 'דגים' },
    { key: 'egg', label: 'ביצים' },
    { key: 'sesame', label: 'שומשום' },
    { key: 'mustard', label: 'חרדל' },
    { key: 'celery', label: 'סלרי' }
  ];
  const ALLERGEN_LABEL = Object.fromEntries(ALLERGENS.map(a => [a.key, a.label]));

  function toList(v) {
    if (!v) return [];
    return Array.isArray(v) ? v.filter(Boolean) : Object.keys(v).map(k => v[k]).filter(Boolean);
  }

  // Firebase מחזיר אובייקטים ולא מערכים. מנרמל לצורה אחת, ממוין לפי order.
  function normalizeMenu(raw) {
    raw = raw || {};
    const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
    const categories = toList(raw.categories).map(c => Object.assign({}, c)).sort(byOrder);
    const images = raw.images || {};
    const items = toList(raw.items).map(it => {
      const o = Object.assign({ visible: true, allergens: [], notes: [], pregnancy: [], vegan: false, gluten: 'unknown', lactose: 'unknown' }, it);
      o.allergens = toList(o.allergens);
      o.notes = toList(o.notes);
      o.pregnancy = toList(o.pregnancy);
      if (o.image === '@fb') o.image = images[o.id] || '';
      return o;
    }).sort(byOrder);
    return { categories, items };
  }

  // מצב של אלרגן במנה: has (מכילה), free (מסומנת כלא מכילה), option (מכילה אבל יש אופציה בלי), unknown (לא צוין)
  function status(item, key) {
    if (key === 'vegan') return item.vegan ? 'free' : 'has';
    if (key === 'gluten' || key === 'lactose') {
      const v = item[key];
      if (v === 'no') return 'free';
      if (v === 'yes') {
        const note = item[key + 'Note'] || '';
        const word = key === 'gluten' ? 'גלוטן' : 'לקטוז';
        const mods = item.mods || '';
        const hasOpt = /אופציה|ניתן/.test(note) || new RegExp('ללא ' + word).test(mods) || new RegExp('ללא ' + word).test(note);
        return hasOpt ? 'option' : 'has';
      }
      return 'unknown';
    }
    return item.allergens.indexOf(key) >= 0 ? 'has' : 'free';
  }

  // opts: { cat, q, avoid: ['gluten', ...], vegan, includeHidden }
  function filterItems(items, opts) {
    opts = opts || {};
    const q = (opts.q || '').trim().toLowerCase();
    return items.filter(it => {
      if (!opts.includeHidden && it.visible === false) return false;
      if (opts.cat && opts.cat !== 'all' && it.cat !== opts.cat) return false;
      if (q) {
        const hay = (it.name + ' ' + it.desc + ' ' + (it.mods || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      if (opts.vegan && !it.vegan) return false;
      for (const k of opts.avoid || []) {
        const s = status(it, k);
        if (s === 'has') return false;
      }
      return true;
    });
  }

  // מזיז מנה למעלה/למטה בתוך הקטגוריה שלה ומחשב מחדש order לכל המנות
  function moveItem(items, id, dir) {
    const it = items.find(x => x.id === id);
    if (!it) return items;
    const sibs = items.filter(x => x.cat === it.cat).sort((a, b) => a.order - b.order);
    const i = sibs.findIndex(x => x.id === id);
    const j = i + (dir < 0 ? -1 : 1);
    if (j < 0 || j >= sibs.length) return items;
    [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
    return renumber(items, sibs);
  }

  // order גלובלי: קטגוריות לפי סדרן ומנות לפי הרצף שנקבע
  function renumber(items, siblingsOverride) {
    const out = items.map(x => Object.assign({}, x));
    const byCat = {};
    out.forEach(x => (byCat[x.cat] = byCat[x.cat] || []).push(x));
    if (siblingsOverride && siblingsOverride.length) {
      byCat[siblingsOverride[0].cat] = siblingsOverride.map(s => out.find(x => x.id === s.id));
    } else {
      Object.keys(byCat).forEach(c => byCat[c].sort((a, b) => a.order - b.order));
    }
    Object.keys(byCat).forEach(c => byCat[c].forEach((x, i) => (x.order = i + 1)));
    return out;
  }

  function moveCategory(cats, id, dir) {
    const list = cats.slice().sort((a, b) => a.order - b.order);
    const i = list.findIndex(c => c.id === id);
    const j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= list.length) return cats;
    [list[i], list[j]] = [list[j], list[i]];
    return list.map((c, k) => Object.assign({}, c, { order: k + 1 }));
  }

  function nextId(items) {
    let max = 0;
    items.forEach(x => {
      const m = /^d(\d+)$/.exec(x.id);
      if (m) max = Math.max(max, +m[1]);
    });
    return 'd' + String(max + 1).padStart(2, '0');
  }

  function validateItem(it) {
    const errs = [];
    if (!it.name || !String(it.name).trim()) errs.push('חסר שם למנה');
    const p = Number(it.price);
    if (!isFinite(p) || p < 0 || p > 9999) errs.push('מחיר לא תקין');
    if (!it.cat) errs.push('חסרה קטגוריה');
    return errs;
  }

  // המרה לצורה שנשמרת ב-Firebase: מנות לפי id, תמונות שהועלו בנפרד (כדי שהצומת הראשי יישאר קל)
  function toFirebase(categories, items) {
    const cats = {}, its = {}, images = {};
    categories.forEach(c => (cats[c.id] = { id: c.id, name: c.name, short: c.short || c.name, order: c.order }));
    items.forEach(it => {
      const o = Object.assign({}, it);
      if (typeof o.image === 'string' && o.image.indexOf('data:image/') === 0) {
        images[o.id] = o.image;
        o.image = '@fb';
      }
      o.notes = o.notes && o.notes.length ? o.notes : null;
      o.pregnancy = o.pregnancy && o.pregnancy.length ? o.pregnancy : null;
      o.allergens = o.allergens && o.allergens.length ? o.allergens : null;
      Object.keys(o).forEach(k => o[k] === undefined && delete o[k]);
      its[o.id] = o;
    });
    return { categories: cats, items: its, images: Object.keys(images).length ? images : null, updated: Date.now() };
  }

  return { ALLERGENS, ALLERGEN_LABEL, normalizeMenu, status, filterItems, moveItem, renumber, moveCategory, nextId, validateItem, toFirebase };
});
