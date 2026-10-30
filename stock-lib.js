// stock-lib.js — לוגיקה נקייה של אפליקציית המלאי וההכנות (ללא DOM, ללא שעון פנימי). נבדקת ב-tests/stock-lib.test.js.
// ב-Node: require('./stock-lib.js'). בדפדפן: SK גלובלי (אחרי recipes-lib.js, שממנו נלקח parseCSV).
(function(root){
'use strict';
// parseCSV מ-recipes-lib.js. נפתר בזמן הקריאה ולא בזמן הטעינה, כדי שסדר תגיות ה-script לא יהיה חשוב
const rb = () => {
  const r = (typeof module === 'object' && module.exports) ? require('./recipes-lib.js') : root.RB;
  if(!r || typeof r.parseCSV !== 'function') throw new Error('stock-lib.js דורש את recipes-lib.js');
  return r;
};

const STATIONS = [{ key: 'cold', name: 'פס קר' }, { key: 'hot', name: 'פס חם' }, { key: 'tabun', name: 'טאבון' }];
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];     // אינדקס 0 = ראשון, כמו Date#getDay()
const HEADERS = ['מוצר', 'יחידה', ...DAYS, 'מתכון', 'הערה'];
const TZ = 'Asia/Jerusalem';
const MAX_QTY = 100000;
const MAX_KEY = 60;

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const oneLine = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

// עיגול ל-2 ספרות אחרי הנקודה בלי רעש נקודה צפה (0.1+0.2 -> 0.3). מחזיר תמיד +0 ולא -0.
function round2(n){
  const r = Math.round(Math.abs(n) * 100 + 1e-9) / 100;
  return n < 0 ? -r : r;
}
// האם הערך כבר "ברזולוציה" של 2 ספרות (עד רעש נקודה צפה)
const hasTwoDecimals = n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-7;

// ---- זמן (תמיד לפי אזור הזמן של המסעדה, לא לפי שעון המכשיר) ----
const dtfCache = new Map();
function dtf(tz, kind){
  const k = tz + '|' + kind;
  let f = dtfCache.get(k);
  if(!f){
    f = new Intl.DateTimeFormat('en-US', kind === 'day'
      ? { timeZone: tz, weekday: 'short' }
      : { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    dtfCache.set(k, f);
  }
  return f;
}
function toDate(d){
  const x = d instanceof Date ? d : (typeof d === 'number' ? new Date(d) : null);
  if(!x || isNaN(x.getTime())) throw new TypeError('תאריך לא תקין');
  return x;
}
const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function dayIdx(date, tz = TZ){
  const w = dtf(tz, 'day').formatToParts(toDate(date)).find(p => p.type === 'weekday').value;
  return WEEKDAY[w];
}
function dateKey(date, tz = TZ){
  const parts = dtf(tz, 'date').formatToParts(toDate(date));
  const g = t => parts.find(p => p.type === t).value;
  return g('year').padStart(4, '0') + '-' + g('month') + '-' + g('day');
}
const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function parseKey(k){
  const m = typeof k === 'string' && k.match(KEY_RE);
  if(!m) throw new TypeError('מפתח תאריך לא תקין');
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const back = new Date(t);
  if(back.getUTCFullYear() !== +m[1] || back.getUTCMonth() !== +m[2] - 1 || back.getUTCDate() !== +m[3]) throw new TypeError('תאריך לא קיים');
  return t;
}
// חשבון לוח שנה ב-UTC, לכן אין סחיפה בגלל שעון קיץ
function addDays(key, n){
  if(!Number.isInteger(n)) throw new TypeError('מספר ימים חייב להיות שלם');
  const d = new Date(parseKey(key) + n * 86400000);
  return String(d.getUTCFullYear()).padStart(4, '0') + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}

// ---- מפתחות Firebase ----
function sanitizeKey(name){
  let s = String(name == null ? '' : name).trim().replace(/[.$#\[\]\/\u0000-\u001F\u007F]/g, '_');
  s = Array.from(s).slice(0, MAX_KEY).join('');
  return s === '__proto__' ? '_proto_' : s;
}

// ---- הגדרות מהגיליון ----
// ערך בסיס: ריק או 0 = לא נדרש. אחרת מספר 0..100000 עד 2 ספרות (פסיק עשרוני מתקבל). אחר = null + אזהרה.
const NUM_RE = /^(\d+(\.\d*)?|\.\d+)$/;
function parseQty(raw){
  const s = String(raw == null ? '' : raw).trim().replace(',', '.');
  if(s === '') return { v: null };
  if(!NUM_RE.test(s)) return { v: null, bad: true };
  const n = Number(s);
  if(!isFinite(n) || n > MAX_QTY || !hasTwoDecimals(n)) return { v: null, bad: true };
  return { v: n === 0 ? null : round2(n) };
}
function parseDefs(csvText){
  if(typeof csvText !== 'string') return null;
  const rows = rb().parseCSV(csvText);
  if(!rows.length) return null;
  const idx = Object.create(null);
  rows[0].forEach((h, i) => { const k = h.trim(); if(!(k in idx)) idx[k] = i; });
  if(!('מוצר' in idx) || DAYS.some(d => !(d in idx))) return null;
  const cell = (row, h) => (h in idx && row[idx[h]] != null ? row[idx[h]] : '');
  const products = [], warnings = [], seen = new Set();
  for(const row of rows.slice(1)){
    const name = oneLine(cell(row, 'מוצר'));
    if(!name) continue;
    const key = sanitizeKey(name);
    if(seen.has(key)){ warnings.push(`מוצר כפול "${name}": השורה השנייה מדולגת`); continue; }
    seen.add(key);
    const base = DAYS.map(d => {
      const raw = cell(row, d), r = parseQty(raw);
      if(r.bad) warnings.push(`${name}, ${d}: ערך לא תקין "${String(raw).trim().slice(0, 20)}", מדולג`);
      return r.v;
    });
    products.push({ name, unit: cell(row, 'יחידה').trim(), base, recipe: cell(row, 'מתכון').trim(), note: cell(row, 'הערה').trim() });
  }
  return products.length ? { products, warnings } : null;
}
function baseFor(product, day){
  if(!product || !Array.isArray(product.base) || !Number.isInteger(day) || day < 0 || day > 6) return null;
  const v = product.base[day];
  return typeof v === 'number' && isFinite(v) && v > 0 ? v : null;
}
const productsForDay = (products, day) => (Array.isArray(products) ? products : []).filter(p => baseFor(p, day) !== null);

// ---- ספירה ----
// ערך שהוזן: מספר או מחרוזת. ריק = לא נספר (undefined). לא תקין = null.
function parseHave(v){
  if(v === null || v === undefined) return undefined;
  let n;
  if(typeof v === 'number') n = v;
  else if(typeof v === 'string'){
    const s = v.trim().replace(',', '.');
    if(s === '') return undefined;
    if(!NUM_RE.test(s)) return null;
    n = Number(s);
  }else return null;
  if(!isFinite(n) || n < 0 || n > MAX_QTY || !hasTwoDecimals(n)) return null;
  return round2(n);
}
function validateCount(products, items, day){
  const errors = [], clean = {};
  if(!isObj(items)) return { ok: false, errors: ['אין נתוני ספירה'], clean };
  const seen = new Set();
  for(const p of productsForDay(products, day)){
    const key = sanitizeKey(p.name);
    if(seen.has(key)) continue;
    seen.add(key);
    if(!hasOwn(items, key)) continue;
    const v = parseHave(items[key]);
    if(v === undefined) continue;
    if(v === null) errors.push(`${p.name}: ערך לא תקין (מספר בין 0 ל-${MAX_QTY}, עד שתי ספרות אחרי הנקודה)`);
    else clean[key] = v;
  }
  if(!errors.length && !Object.keys(clean).length) errors.push('יש לספור לפחות מוצר אחד');
  return { ok: errors.length === 0, errors, clean };
}
function latestCount(counts){
  if(!isObj(counts)) return null;
  let best = null;
  for(const id of Object.keys(counts)){
    const c = counts[id];
    if(!isObj(c) || typeof c.t !== 'number' || !isFinite(c.t)) continue;
    if(!best || c.t > best.t || (c.t === best.t && id > best.id)) best = { id, t: c.t, by: typeof c.by === 'string' ? c.by : '', items: isObj(c.items) ? c.items : {} };
  }
  return best;
}

// ---- רשימת הכנות ----
function prepList(products, items, day){
  const src = isObj(items) ? items : {};
  const prep = [], enough = [], uncounted = [];
  for(const p of productsForDay(products, day)){
    const base = baseFor(p, day), key = sanitizeKey(p.name);
    let have;
    if(hasOwn(src, key)){
      const v = src[key];
      if(typeof v === 'number' && isFinite(v) && v >= 0) have = round2(v);
    }
    if(have === undefined){ uncounted.push({ name: p.name, unit: p.unit, base }); continue; }
    const need = round2(base - have);
    if(need > 0) prep.push({ name: p.name, unit: p.unit, base, have, need, recipe: p.recipe || p.name, note: p.note });
    else enough.push({ name: p.name, unit: p.unit, base, have });
  }
  const ratio = x => Math.round(x.need / x.base * 1e6);
  prep.sort((a, b) => ratio(b) - ratio(a) || a.name.localeCompare(b.name, 'he'));
  return { prep, enough, uncounted };
}
function fmtQty(n){
  if(typeof n !== 'number' || !isFinite(n)) return '';
  return String(round2(n));
}

// ---- וואטסאפ ----
function formatWhatsApp({ station, dateKey: dk, dayName, by, prep, uncounted } = {}){
  const m = typeof dk === 'string' && dk.match(KEY_RE);
  const when = [oneLine(dayName), m ? `${m[3]}/${m[2]}/${m[1]}` : ''].filter(Boolean).join(' ');
  const out = ['הכנות' + (oneLine(station) ? ' ' + oneLine(station) : '') + (when ? ', ' + when : '')];
  if(oneLine(by)) out.push('נספר על ידי ' + oneLine(by));
  out.push('');
  const list = Array.isArray(prep) ? prep : [], un = Array.isArray(uncounted) ? uncounted : [];
  if(list.length){
    out.push('להכין:');
    for(const x of list) out.push(`${oneLine(x.name)}: ${fmtQty(x.need)}${oneLine(x.unit) ? ' ' + oneLine(x.unit) : ''}`);
  }else out.push(un.length ? 'אין מה להכין לפי מה שנספר.' : 'אין מה להכין, הכול מספיק.');
  if(un.length){ out.push(''); out.push('לא נספר: ' + un.map(x => oneLine(x.name)).join(', ')); }
  return out.join('\n');
}

const api = { STATIONS, DAYS, HEADERS, parseDefs, baseFor, dayIdx, dateKey, addDays, sanitizeKey, productsForDay, validateCount, latestCount, prepList, fmtQty, formatWhatsApp };
if(typeof module === 'object' && module.exports) module.exports = api; else root.SK = api;
})(typeof self !== 'undefined' ? self : this);
