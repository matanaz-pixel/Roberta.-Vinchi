// בניית מבחן אמריקאי מתוך תוכן התפריט. בלי תלות ב-DOM, כדי שאפשר לבדוק ב-node.
// השאלות נבנות מחדש בכל פעם מ-menu-data.json, כך שעדכון תפריט מעדכן את המבחן.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./menu-lib.js'));
  else root.MenuQuiz = factory(root.MenuLib);
})(typeof self !== 'undefined' ? self : this, function (L) {
  const LEVEL = 70;       // רמת קושי מבוקשת (1 עד 100). קובעת את חלק השאלות הקשות במבחן
  const COUNT = 20;       // מספר שאלות
  const PASS = 70;        // ציון עובר באחוזים

  function rng(seed) {    // mulberry32
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
  function shuffle(arr, r) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function sample(arr, n, r) { return shuffle(arr, r).slice(0, n); }

  // מסדר את התשובות בסדר אקראי ומחזיר שאלה שלמה
  function build(kind, hard, q, correct, wrong, r) {
    const opts = shuffle([correct].concat(wrong), r);
    return { kind, hard, q, options: opts, answer: opts.indexOf(correct) };
  }

  // שינויים אפשריים: רק ניסוחי "ללא/בלי X", כדי שיהיה אפשר להשוות בין מנות
  function modPieces(it) {
    if (!it.mods || /אין שינויים/.test(it.mods)) return [];
    return it.mods.split(/[,\n.]/)
      .map(s => s.replace(/^(ניתן|אפשר)\s+(לקבל|להוציא)?\s*/, '').replace(/\s+/g, ' ').trim())
      .map(s => s.replace(/^ניתן\s+/, '').replace(/^אפשר\s+/, '').replace(/^ה?ללא\s+ה/, 'ללא ').replace(/^בלי\s+ה/, 'בלי '))
      .filter(s => /^(ללא|בלי)\s\S/.test(s) && s.length < 40);
  }
  const normPiece = s => s.replace(/^(ללא|בלי)\s+/, '');

  const GLUTEN_LABELS = ['מכילה גלוטן', 'לא מכילה גלוטן', 'מכילה גלוטן, אבל אפשר בלי', 'לא סומן, לשאול את המטבח'];
  const LACTOSE_LABELS = ['מכילה לקטוז', 'לא מכילה לקטוז', 'מכילה לקטוז, אבל אפשר בלי', 'לא סומן, לשאול את המטבח'];
  const STATUS_IDX = { has: 0, free: 1, option: 2, unknown: 3 };

  // כל מחולל מקבל (items, r, used) ומחזיר שאלה או null. used מונע שתי שאלות על אותה מנה באותו סוג
  const GEN = {
    priceFar(items, r, used) {   // קל: מסיחי מחיר רחוקים
      const it = pick(items.filter(x => !used.has('p' + x.id)), r); if (!it) return null;
      const far = [...new Set(items.map(x => Number(x.price)))].filter(p => Math.abs(p - it.price) >= 10);
      if (far.length < 3) return null;
      used.add('p' + it.id);
      return build('price', false, 'כמה עולה "' + it.name + '"?', it.price + ' ₪', sample(far, 3, r).map(p => p + ' ₪'), r);
    },
    vegan(items, r) {
      const v = items.filter(x => x.vegan), nv = items.filter(x => !x.vegan); if (!v.length || nv.length < 3) return null;
      return build('vegan', false, 'איזו מהמנות טבעונית?', pick(v, r).name, sample(nv, 3, r).map(x => x.name), r);
    },
    glutenFree(items, r) {
      const a = items.filter(x => L.status(x, 'gluten') === 'free'), b = items.filter(x => L.status(x, 'gluten') === 'has');
      if (!a.length || b.length < 3) return null;
      return build('gluten', false, 'איזו מהמנות לא מכילה גלוטן?', pick(a, r).name, sample(b, 3, r).map(x => x.name), r);
    },
    lactoseHas(items, r) {
      const a = items.filter(x => L.status(x, 'lactose') === 'has'), b = items.filter(x => L.status(x, 'lactose') === 'free');
      if (a.length < 1 || b.length < 3) return null;
      return build('lactose', false, 'איזו מהמנות מכילה לקטוז?', pick(a, r).name, sample(b, 3, r).map(x => x.name), r);
    },
    // קשה: מסיחי מחיר קרובים
    priceNear(items, r, used) {
      const it = pick(items.filter(x => !used.has('n' + x.id)), r); if (!it) return null;
      const near = [...new Set(items.map(x => Number(x.price)))].filter(p => p !== it.price && Math.abs(p - it.price) <= 8);
      if (near.length < 3) return null;
      used.add('n' + it.id);
      return build('priceNear', true, 'כמה עולה "' + it.name + '"?', it.price + ' ₪', sample(near, 3, r).map(p => p + ' ₪'), r);
    },
    cheaper(items, r, used) {
      for (let k = 0; k < 20; k++) {
        const a = pick(items, r), cand = items.filter(x => x.id !== a.id && Math.abs(x.price - a.price) <= 6 && x.price !== a.price);
        if (!cand.length || used.has('c' + a.id)) continue;
        const b = pick(cand, r); used.add('c' + a.id);
        const hi = a.price > b.price ? a : b, lo = hi === a ? b : a;
        return build('compare', true, 'איזו מהשתיים יקרה יותר?', hi.name, [lo.name], r);
      }
      return null;
    },
    optionGluten(items, r) { return optionQ(items, r, 'gluten', 'גלוטן'); },
    optionLactose(items, r) { return optionQ(items, r, 'lactose', 'לקטוז'); },
    glutenStatus(items, r, used) { return statusQ(items, r, used, 'gluten', 'גלוטן', GLUTEN_LABELS); },
    lactoseStatus(items, r, used) { return statusQ(items, r, used, 'lactose', 'לקטוז', LACTOSE_LABELS); },
    mods(items, r, used) {
      const withMods = items.filter(x => modPieces(x).length && !used.has('m' + x.id));
      const it = pick(withMods, r); if (!it) return null;
      const mine = modPieces(it), mineN = new Set(mine.map(normPiece));
      const others = [...new Set([].concat(...items.filter(x => x.id !== it.id).map(modPieces)))].filter(p => !mineN.has(normPiece(p)));
      if (others.length < 3) return null;
      used.add('m' + it.id);
      return build('mods', true, 'איזה שינוי אפשר לבקש במנה "' + it.name + '"?', pick(mine, r), sample(others, 3, r), r);
    },
    noChanges(items, r) {
      const none = items.filter(x => /אין שינויים/.test(x.mods || '')), some = items.filter(x => modPieces(x).length);
      if (!none.length || some.length < 3) return null;
      return build('noMods', true, 'באיזו מהמנות אין שינויים אפשריים?', pick(none, r).name, sample(some, 3, r).map(x => x.name), r);
    },
    pregnancy(items, r) {
      const a = items.filter(x => (x.pregnancy || []).length), b = items.filter(x => !(x.pregnancy || []).length);
      if (!a.length || b.length < 3) return null;
      return build('pregnancy', true, 'לאיזו מהמנות יש הערה מיוחדת לנשים בהיריון?', pick(a, r).name, sample(b, 3, r).map(x => x.name), r);
    }
  };
  function optionQ(items, r, key, word) {
    const a = items.filter(x => L.status(x, key) === 'option'), b = items.filter(x => L.status(x, key) === 'has');
    if (!a.length || b.length < 3) return null;
    return build('option_' + key, true, 'איזו מהמנות מכילה ' + word + ', אבל אפשר לקבל אותה בלי ' + word + '?', pick(a, r).name, sample(b, 3, r).map(x => x.name), r);
  }
  function statusQ(items, r, used, key, word, labels) {
    const it = pick(items.filter(x => L.status(x, key) !== 'unknown' && !used.has(key + x.id)), r); if (!it) return null;
    used.add(key + it.id);
    const ans = labels[STATUS_IDX[L.status(it, key)]];
    return build('status_' + key, true, 'מה נכון לגבי ' + word + ' במנה "' + it.name + '"?', ans, labels.filter(l => l !== ans), r);
  }

  const EASY = ['priceFar', 'vegan', 'glutenFree', 'lactoseHas'];
  const HARD = ['priceNear', 'cheaper', 'optionGluten', 'optionLactose', 'glutenStatus', 'lactoseStatus', 'mods', 'noChanges', 'pregnancy'];

  // חלק השאלות הקשות לפי רמת הקושי: ברמה 70 בערך שני שליש
  function hardShare(level) { return Math.max(0.1, Math.min(0.9, (level - 25) / 65)); }

  function generate(menu, opts) {
    opts = opts || {};
    const m = L.normalizeMenu(menu);
    const items = m.items.filter(x => x.visible !== false && x.price !== '' && isFinite(Number(x.price))).map(x => Object.assign({}, x, { price: Number(x.price) }));
    const r = rng(opts.seed != null ? opts.seed : Math.floor(Math.random() * 4294967296));
    const n = opts.count || COUNT, share = hardShare(opts.level || LEVEL);
    const used = new Set(), out = [], seenQ = new Set(), perKind = {};
    const CAP = { price: 5, priceNear: 3, pregnancy: 1, noMods: 1 };
    let guard = 0;
    while (out.length < n && guard++ < n * 40) {
      const pool = r() < share ? HARD : EASY;
      const q = GEN[pick(pool, r)](items, r, used);
      if (!q || seenQ.has(q.q + '|' + q.options[q.answer])) continue;
      if (new Set(q.options).size !== q.options.length) continue;
      if ((perKind[q.kind] || 0) >= (CAP[q.kind] || 3)) continue;
      perKind[q.kind] = (perKind[q.kind] || 0) + 1;
      seenQ.add(q.q + '|' + q.options[q.answer]);
      out.push(q);
    }
    return out;
  }

  function score(questions, picks) {
    let right = 0;
    const wrong = [];
    questions.forEach((q, i) => {
      if (picks[i] === q.answer) right++;
      else wrong.push({ q: q.q, chosen: picks[i] == null ? '(לא נענתה)' : q.options[picks[i]], correct: q.options[q.answer] });
    });
    const pct = questions.length ? Math.round(right * 100 / questions.length) : 0;
    return { right, total: questions.length, pct, pass: pct >= PASS, wrong };
  }

  // ---- גרסאות קבועות שהמנהל מאשר ----
  // טביעת אצבע של התוכן שהשאלות נשענות עליו. אם התפריט משתנה, הגרסאות שאושרו כבר לא בהכרח נכונות
  function menuHash(menu) {
    const m = L.normalizeMenu(menu);
    const str = JSON.stringify(m.items.filter(x => x.visible !== false).sort((a, b) => String(a.id) < String(b.id) ? -1 : 1).map(x => [x.name, x.price, x.gluten, x.lactose, x.vegan, x.mods || '', x.glutenNote || '', x.lactoseNote || '', x.pregnancy || []]));
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  const keyOf = q => q.q + '|' + q.options[q.answer];
  const fresh = q => Object.assign({}, q, { ok: false });

  function buildVersions(menu, n) {
    n = n || 10;
    const versions = [];
    for (let v = 1; v <= n; v++) {
      versions.push({ id: 'v' + v, seed: v * 7919, questions: generate(menu, { seed: v * 7919 }).map(fresh) });
    }
    return { version: 1, menuHash: menuHash(menu), versions };
  }
  const isApproved = v => v.questions.length > 0 && v.questions.every(q => q.ok === true);

  // מחליף שאלה אחת בשאלה חדשה (לא כפולה בגרסה, ובאותה רמת קושי) ומחזיר גרסה חדשה
  function replaceQuestion(menu, version, idx, seed) {
    const old = version.questions[idx];
    const have = new Set(version.questions.map(keyOf));
    for (let k = 0; k < 200; k++) {
      const cand = generate(menu, { seed: (seed || 1) * 1009 + k, count: 30 }).find(q => q.hard === old.hard && !have.has(keyOf(q)) && q.q !== old.q);
      if (cand) {
        const questions = version.questions.slice();
        questions[idx] = fresh(cand);
        return Object.assign({}, version, { questions });
      }
    }
    return version;
  }

  return { LEVEL, COUNT, PASS, generate, score, hardShare, modPieces, menuHash, buildVersions, isApproved, replaceQuestion };
});
