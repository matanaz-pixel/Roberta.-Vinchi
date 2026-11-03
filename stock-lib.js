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
// עמודות אופציונליות: גודל מנה (גרם) למוצר שמחולק למנות; נפח קופסה (ביחידת המוצר) למוצר שיושב בקופסה;
// תפוקת מתכון (ביחידת המוצר) למתכון בסיסי אחד; גדלי מתכון: "תווית=כמות;תווית=כמות" (כמות ביחידת המוצר)
const OPT_HEADERS = ['גודל מנה', 'נפח קופסה', 'תפוקת מתכון', 'גדלי מתכון'];
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
const THOUSANDS_RE = /,\d{3}(\D|$)/;
const NUM_RE = /^(\d+(\.\d*)?|\.\d+)$/;
function parseQty(raw){
  let s = String(raw == null ? '' : raw).trim();
  if(s === '') return { v: null };
  if(THOUSANDS_RE.test(s)) return { v: null, bad: true };       // "1,000" אינו 1: דוחים במקום לנחש
  s = s.replace(',', '.');
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
    const prod = { name, unit: cell(row, 'יחידה').trim(), base, recipe: cell(row, 'מתכון').trim(), note: cell(row, 'הערה').trim() };
    const opt = h => {
      const raw = cell(row, h); if(!String(raw).trim()) return null;
      const r = parseQty(raw);
      if(r.bad || r.v === null){ warnings.push(`${name}, ${h}: ערך לא תקין "${String(raw).trim().slice(0, 20)}", מדולג`); return null; }
      return r.v;
    };
    const pg = opt('גודל מנה'), bv = opt('נפח קופסה'), yl = opt('תפוקת מתכון');
    if(pg !== null) prod.portionG = pg;
    if(bv !== null) prod.boxVol = bv;
    if(yl !== null) prod.yield = yl;
    const sraw = String(cell(row, 'גדלי מתכון')).trim();
    if(sraw){
      const sizes = [];
      for(const part of sraw.split(/[;\n]/)){
        const t = part.trim(); if(!t) continue;
        const i = t.lastIndexOf('=');
        const label = i > 0 ? oneLine(t.slice(0, i)).slice(0, 30) : '', q = i > 0 ? parseQty(t.slice(i + 1)) : { bad: true };
        if(!label || q.bad || q.v === null){ warnings.push(`${name}, גדלי מתכון: "${t.slice(0, 30)}" לא תקין (צורה: תווית=כמות), מדולג`); continue; }
        if(sizes.length < 8) sizes.push({ label, qty: q.v });
      }
      if(sizes.length) prod.sizes = sizes;
    }
    products.push(prod);
  }
  return products.length ? { products, warnings } : null;
}
// טאב שלא נקרא כהגדרות: 'headers' = חסרה כותרת (מוצר או אחד הימים), 'empty' = הכותרות תקינות אבל אין מוצרים
function defsProblem(csvText){
  if(typeof csvText !== 'string') return 'headers';
  const rows = rb().parseCSV(csvText);
  if(!rows.length) return 'headers';
  const have = new Set(rows[0].map(h => h.trim()));
  return have.has('מוצר') && DAYS.every(d => have.has(d)) ? 'empty' : 'headers';
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
    let s = v.trim();
    if(s === '') return undefined;
    if(THOUSANDS_RE.test(s)) return null;
    s = s.replace(',', '.');
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
/** צריכה בפועל בין שתי ספירות: מה שהיה בספירה הקודמת + מה שהוחלט להכין, פחות מה שנשאר בספירה הנוכחית.
 *  prevItems/curItems: פריטי הספירה (לפי מפתח מנוקה). prepItems: פריטי החלטת ההכנה של הספירה הקודמת (יכול להיות null).
 *  מחזיר רק מוצרים שנספרו בשתי הספירות. used שלילי = כנראה נכנסה סחורה או שההכנה לא בוצעה כפי שהוחלט, ולכן לא מחושב. */
function consumption(products, prevItems, prepItems, curItems, prevDay){
  const out = [];
  const a = isObj(prevItems) ? prevItems : {}, c = isObj(curItems) ? curItems : {}, pr = isObj(prepItems) ? prepItems : null;
  for(const p of Array.isArray(products) ? products : []){
    const key = sanitizeKey(p.name);
    const s0 = hasOwn(a, key) ? a[key] : undefined, e0 = hasOwn(c, key) ? c[key] : undefined;
    if(typeof s0 !== 'number' || typeof e0 !== 'number' || !isFinite(s0) || !isFinite(e0)) continue;
    const prepped = pr && hasOwn(pr, key) && typeof pr[key] === 'number' && isFinite(pr[key]) ? pr[key] : null;
    const raw = round2(s0 + (prepped || 0) - e0);
    out.push({ name: p.name, unit: p.unit, start: s0, prep: prepped, end: e0, used: raw >= 0 ? raw : null, odd: raw < 0, prepKnown: prepped !== null, base: Number.isInteger(prevDay) ? baseFor(p, prevDay) : null });
  }
  return out;
}
/** תיאור משני לכמות: למוצר בקופסה כמה קופסאות, למוצר שמחולק למנות כמה משקל. מחרוזת ריקה כשאין מידע. */
function describe(p, qty){
  if(!p || typeof qty !== 'number' || !isFinite(qty)) return '';
  if(p.boxVol){ const b = round2(qty / p.boxVol); return `${fmtQty(b)} ${b === 1 ? 'קופסה' : 'קופסאות'}`; }
  if(p.portionG){ const g = qty * p.portionG; return g >= 1000 ? `${fmtQty(round2(g / 1000))} ק"ג` : `${fmtQty(Math.round(g))} גרם`; }
  return '';
}
/** כמות עם יחידה ותיאור משני: "24 מנות (3.6 ק"ג)" או "7 ליטר (2 קופסאות)". */
function fmtFull(p, qty){
  if(typeof qty !== 'number' || !isFinite(qty)) return '';
  const u = p && p.unit ? ' ' + p.unit : '', d = describe(p, qty);
  return fmtQty(qty) + u + (d ? ` (${d})` : '');
}
/** כמה מתכונים בסיסיים זה (לפי תפוקת מתכון), או null כשאין תפוקה. */
function recipeMult(p, qty){
  return p && p.yield > 0 && typeof qty === 'number' && isFinite(qty) ? round2(qty / p.yield) : null;
}
const unitsOfBoxes = (p, boxes) => round2(boxes * p.boxVol);
function fmtQty(n){
  if(typeof n !== 'number' || !isFinite(n)) return '';
  return String(round2(n));
}

// ---- כמה זמן זה מספיק ----
// הבסיס של כל יום = הצריכה המשוערת של אותו יום. מדמים צריכה יום אחר יום החל מ-startDay.
// ימים בלי בסיס (סגור) לא צורכים ולא מופיעים. days: [{ day, need, got }], week: האם הכמות מכסה שבוע שלם.
function coverageDays(product, qty, startDay){
  if(typeof qty !== 'number' || !isFinite(qty) || qty < 0 || !Number.isInteger(startDay) || startDay < 0 || startDay > 6) return null;
  let s = round2(qty);
  const days = [];
  for(let i = 0; i < 7; i++){
    const day = (startDay + i) % 7, need = baseFor(product, day);
    if(need === null) continue;
    const got = Math.min(s, need);
    days.push({ day, need, got });
    s = round2(s - got);
    if(got < need) return { days, week: false };
  }
  return { days, week: true };
}
// טקסט קצר בעברית לפי coverageDays
function coverage(product, qty, startDay){
  const c = coverageDays(product, qty, startDay);
  if(!c) return '';
  if(c.week) return 'מספיק לשבוע ומעלה';
  const i = c.days.length - 1, last = c.days[i];       // היום הראשון שלא מכוסה במלואו
  if(last.got > 0) return last.day === startDay ? 'מספיק לחלק מהיום' : `מספיק עד יום ${DAYS[last.day]} (חלק מהיום)`;
  return i === 0 ? 'לא מספיק להיום' : (i === 1 ? 'מספיק עד סוף היום' : `מספיק עד סוף יום ${DAYS[c.days[i - 1].day]}`);
}

// ---- וואטסאפ ----
// rows: כל מוצרי הפס: { name, unit, have (מספר או undefined אם לא נספר), prep (מספר או undefined), cover }
function formatWhatsApp({ station, dateKey: dk, dayName, by, rows, prep, uncounted } = {}){
  const m = typeof dk === 'string' && dk.match(KEY_RE);
  const when = [oneLine(dayName), m ? `${m[3]}/${m[2]}/${m[1]}` : ''].filter(Boolean).join(' ');
  const out = ['הכנות' + (oneLine(station) ? ' ' + oneLine(station) : '') + (when ? ', ' + when : '')];
  if(oneLine(by)) out.push('נספר על ידי ' + oneLine(by));
  out.push('');
  if(Array.isArray(rows)){
    for(const r of rows){
      const u = oneLine(r.unit) ? ' ' + oneLine(r.unit) : '';
      const parts = [];
      const counted = typeof r.have === 'number' && isFinite(r.have);
      parts.push(counted ? (oneLine(r.haveFmt) ? 'יש ' + oneLine(r.haveFmt) : `יש ${fmtQty(r.have)}${u}`) : 'לא נספר');
      if(typeof r.prep === 'number' && isFinite(r.prep) && r.prep > 0) parts.push('להכין ' + (oneLine(r.prepFmt) || `${fmtQty(r.prep)}${u}`));
      else if(counted && typeof r.need === 'number' && r.need > 0) parts.push(`לא מכינים (חסר ${fmtQty(r.need)}${u})`);
      else if(counted) parts.push('אין צורך להכין');
      if(oneLine(r.cover) && counted) parts.push(oneLine(r.cover));
      out.push(`${oneLine(r.name)}: ${parts.join(', ')}`);
    }
    if(!rows.length) out.push('אין מוצרים להיום.');
    return out.join('\n');
  }
  const list = Array.isArray(prep) ? prep : [], un = Array.isArray(uncounted) ? uncounted : [];
  if(list.length){
    out.push('להכין:');
    for(const x of list) out.push(`${oneLine(x.name)}: ${fmtQty(x.need)}${oneLine(x.unit) ? ' ' + oneLine(x.unit) : ''}`);
  }else out.push(un.length ? 'אין מה להכין לפי מה שנספר.' : 'אין מה להכין, הכול מספיק.');
  if(un.length){ out.push(''); out.push('לא נספר: ' + un.map(x => oneLine(x.name)).join(', ')); }
  return out.join('\n');
}

const api = { STATIONS, DAYS, HEADERS, OPT_HEADERS, describe, fmtFull, recipeMult, unitsOfBoxes, parseDefs, defsProblem, baseFor, dayIdx, dateKey, addDays, sanitizeKey, productsForDay, validateCount, latestCount, prepList, fmtQty, coverageDays, coverage, formatWhatsApp, consumption };
if(typeof module === 'object' && module.exports) module.exports = api; else root.SK = api;
})(typeof self !== 'undefined' ? self : this);
