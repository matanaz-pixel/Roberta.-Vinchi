// recipes-lib.js — לוגיקה נקייה של ספר המתכונים (ללא DOM). נבדקת ב-tests/ ורצה גם בדפדפן וגם ב-Node.
(function(root){
'use strict';
function parseCSV(text){
  const rows = []; let row = [], cell = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(quoted){
      if(c === '"'){ if(text[i+1] === '"'){ cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if(c === '"') quoted = true;
    else if(c === ','){ row.push(cell); cell = ''; }
    else if(c === '\n' || c === '\r'){
      if(c === '\r' && text[i+1] === '\n') i++;
      row.push(cell); cell = '';
      if(row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if(row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}

function lines(s){ return (s || '').split('\n').map(x => x.trim()).filter(Boolean); }

// ---- הכפלת כמויות ----
// מוכפלת רק הכמות שבתחילת שורת מצרך ("2 ק"ג ...", "כ-3 ...", "חצי פח ...", או "מ-2 לימונים" כשאין כמות בהתחלה).
// מספרים אחרים בשורה (אחוזים, עובי, זמן, משקל ליחידה, "לכל 2 ק"ג") נשארים כמו שהם.
const FRACTIONS = [[1/8, '⅛'], [1/4, '¼'], [1/3, '⅓'], [1/2, '½'], [2/3, '⅔'], [3/4, '¾']];
const METRIC = ['גרם', 'ק"ג', 'מ"ל', 'ליטר'];
function fmtNum(x, unit){
  if(unit && !METRIC.includes(unit) && x < 20){                     // יחידות ספירה: ½ כפית, 1¼ פח
    const whole = Math.floor(x + 1e-9), frac = x - whole;
    if(frac < 0.02) return String(whole);
    const f = FRACTIONS.find(([v]) => Math.abs(frac - v) < 0.02);
    if(f) return (whole ? whole : '') + f[1];
  }
  const v = Math.round(x * 100) / 100;
  const [i, d] = String(v).split('.');
  return (i.length > 3 ? i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : i) + (d ? '.' + d : '');
}
const toNum = s => parseFloat(s.replace(/,/g, ''));
const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
const WORD_NUM = { 'חצי': 0.5, 'רבע': 0.25, 'שליש': 1 / 3 };
// כמות בתחילת שורה: [קידומת][מספר או טווח או מילה][רווח][יחידה]
const LEAD_RE = new RegExp(String.raw`^((?:תפוקה:\s*)?(?:כ-|ל-|ל)?)(?:(${NUM})(?:\s*-\s*(${NUM}))?|(חצי|רבע|שליש))(?=\s|$)(\s+)?(\S+)?`);
const FROM_RE = new RegExp(String.raw`(^|[\s(])מ-(${NUM})(?=\s)`);
function scaleQty(a, b, word, unit, k){
  let v = word ? WORD_NUM[word] * k : toNum(a) * k;
  if(b !== undefined){
    return { text: fmtNum(v, unit) + '-' + fmtNum(toNum(b) * k, unit), unit };
  }
  if(unit === 'גרם' && v >= 1000){ v /= 1000; unit = 'ק"ג'; }
  else if(unit === 'מ"ל' && v >= 1000){ v /= 1000; unit = 'ליטר'; }
  else if(unit === 'ק"ג' && v < 1){ v *= 1000; unit = 'גרם'; }
  else if(unit === 'ליטר' && v < 1){ v *= 1000; unit = 'מ"ל'; }
  return { text: fmtNum(v, unit), unit };
}
// "(מומס ב-24 גרם מים)" : הכמות שבסוגריים תלויה ישירות בכמות הפותחת, ולכן מוכפלת איתה
function scaleDissolved(rest, k){
  return rest.replace(/\((מומס(?:ת)?|מעורבב(?:ת)?)\s+ב-?\s*([^)]*)\)/, (m, w, inner) => '(' + w + ' ב-' + scaleAll(inner, k) + ')');
}
function scaleLine(s, k){
  if(k === 1) return s;
  const m = s.match(LEAD_RE);
  if(m){
    const [all, pre, a, b, word, sp, unit] = m;
    const q = scaleQty(a, b, word, unit, k);
    const prefix = pre === 'ל' ? 'ל-' : pre;                         // "לחצי ליטר" > "ל-1 ליטר"
    return prefix + q.text + (sp || '') + (q.unit || '') + scaleDissolved(s.slice(all.length), k);
  }
  const f = s.match(FROM_RE);                                         // "מיץ מ-2 לימונים"
  if(f) return s.slice(0, f.index) + f[1] + 'מ-' + fmtNum(toNum(f[2]) * k, 'יח') + s.slice(f.index + f[0].length);
  return s;
}
// כותרת משנה ושורת תפוקה: כל המספרים מתייחסים לגודל המנה, ולכן כולם מוכפלים
function scaleAll(s, k){
  if(k === 1) return s;
  return s.replace(new RegExp(String.raw`(${NUM})(\s+(?:גרם|מ"ל))?`, 'g'), (m, n, u) => {
    const q = scaleQty(n, undefined, undefined, u && u.trim(), k);
    return q.text + (u ? ' ' + q.unit : '');
  });
}
function scaleYield(s, k){
  if(k === 1) return s;
  if(!/\d|חצי|רבע|שליש/.test(s)) return s + ' (×' + fmtNum(k) + ')';   // "תפוקה: גסטרונום אחד"
  const lead = scaleLine(s, k);
  const i = lead.indexOf('(');
  return i < 0 ? lead : lead.slice(0, i) + scaleAll(lead.slice(i), k);   // גם "(כ-5 מנות)"
}
// שורת "מנות: 100 (270 גרם למנה)" מוצגת כ"100 מנות (270 גרם למנה)". מוכפל רק מספר המנות, לא המשקל למנה
function yieldText(l, k){
  const m = l.match(new RegExp(String.raw`^מנות:\s*(כ-?\s*|~\s*)?(${NUM})(?:\s*-\s*(${NUM}))?(.*)$`));
  if(!m) return l.startsWith('מנות:') ? l.replace(/^מנות:\s*/, '') : scaleYield(l, k);
  const pre = m[1] ? 'כ-' : '';
  return pre + fmtNum(toNum(m[2]) * k, 'יח') + (m[3] ? '-' + fmtNum(toNum(m[3]) * k, 'יח') : '') + ' מנות' + m[4];
}
function parseMultiplier(str){
  let s = String(str).trim().replace(/^[x×*]\s*|\s*[x×*]$/gi, '').replace(',', '.');
  const glyph = FRACTIONS.find(([, g]) => s.endsWith(g));
  if(glyph) s = (s.slice(0, -1).trim() || '0') + '+' + glyph[0];
  let v;
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/), frac = s.match(/^(\d+)\/(\d+)$/), sum = s.match(/^(\d*\.?\d*)\+([\d.]+)$/);
  if(mixed) v = +mixed[1] + mixed[2] / mixed[3];
  else if(frac) v = frac[1] / frac[2];
  else if(sum) v = (+sum[1] || 0) + +sum[2];
  else if(/^\d*\.?\d+$/.test(s)) v = +s;
  return isFinite(v) && v > 0 && v <= 100 ? v : null;
}

// עמודות מזוהות לפי שם הכותרת, כך שהוספת עמודה או שינוי סדר בגיליון לא משבשים את הספר
const COLUMNS = { cat: 'קטגוריה', title: 'שם', ingredients: 'מצרכים', steps: 'הוראות הכנה', note: 'הערות', allergens: 'אלרגנים', current: 'תפריט נוכחי', variants: 'גרסאות' };
const REQUIRED = ['cat', 'title', 'ingredients', 'steps'];

// עמודת "גרסאות": בלוקים מופרדים בשורה של --- . בכל בלוק שורה ראשונה = שם הגרסה (למשל "18 מנות"), ואחריה המצרכים של אותה גרסה.
function parseVariants(text){
  const out = [];
  for(const block of (text || '').split(/^[ \t]*-{3,}[ \t]*\r?$/m)){
    const ls = lines(block);
    if(ls.length >= 2) out.push({ label: ls[0], ingredients: ls.slice(1) });
  }
  return out.length >= 2 ? out : null;
}

// עמודת "אלרגנים": רשימה מופרדת בפסיקים/שורות. null = לא הוזן (לא אומר שאין אלרגנים!), [] = הוזן "ללא"
function parseAllergens(text){
  const t = (text || '').trim();
  if(!t) return null;
  if(/^(ללא|אין|none|-)$/i.test(t)) return [];
  return t.split(/[,\n;،]+/).map(x => x.trim()).filter(Boolean);
}
function parseTable(text){
  const rows = parseCSV(text);
  if(!rows.length) return null;
  const header = rows[0].map(h => h.trim());
  const idx = {};
  for(const [k, name] of Object.entries(COLUMNS)) idx[k] = header.indexOf(name);
  if(REQUIRED.some(k => idx[k] < 0)) return null;
  const get = (r, k) => idx[k] < 0 ? '' : (r[idx[k]] || '').trim();
  const list = rows.slice(1).map((r, i) => ({
    cat: get(r, 'cat'), title: get(r, 'title'),
    ingredients: lines(get(r, 'ingredients')), steps: lines(get(r, 'steps')), note: get(r, 'note'),
    raw: { 'שם': get(r, 'title'), 'מצרכים': get(r, 'ingredients'), 'הוראות הכנה': get(r, 'steps'), 'הערות': get(r, 'note') },
    allergens: parseAllergens(get(r, 'allergens')),
    current: get(r, 'current') === 'כן',
    variants: parseVariants(get(r, 'variants')),
    order: i
  })).filter(r => r.title);
  return list.length ? list : null;
}


// בדיקת שדה "מנות" בבקשת תיקון: חייב להתחיל במספר (או טווח, או כ-), ואפשר משקל למנה בסוגריים. מחזיר '' אם תקין
function validatePortions(v){
  v = String(v).trim();
  if(!v) return '';
  return new RegExp(String.raw`^(?:כ-?\s*|~\s*)?(?:${NUM})(?:\s*-\s*(?:${NUM}))?(?:\s*\(.*\))?\s*$`).test(v) ? '' : 'מספר המנות חייב להתחיל במספר, למשל 100 או 100-120 או כ-100 (270 גרם למנה)';
}
// תפוקה: טקסט חופשי, אבל חייב להכיל כמות כלשהי
function validateYield(v){
  v = String(v).trim();
  if(!v) return '';
  return /\d|חצי|רבע|שליש|אחד|אחת|שני|שתי/.test(v) ? '' : 'התפוקה צריכה לכלול כמות, למשל 27 ק"ג בצק';
}

// ---- חיפוש סלחני: אותיות סופיות, גרשיים, ניקוד, כתיב מלא/חסר (י/ו) וריבוי ----
// כל מילת חיפוש חייבת להתאים למילה בתחילתה (לא באמצע מילה), כך ש"שום" לא מוצא "שמן".
// כתיב חסר (הסרת י/ו) מותר רק למילים של 3 אותיות לפחות אחרי ההסרה.
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
function fold(s){
  return String(s).toLowerCase().replace(/[֑-ׇ]/g, '').replace(/[ךםןףץ]/g, c => FINALS[c])
    .replace(/[׳’‘`´]/g, "'").replace(/[״“”]/g, '"').replace(/['"]/g, '');
}
const strip = s => s.replace(/[יו]/g, '');
function words(s){ return fold(s).split(/[^א-תa-z0-9]+/).filter(Boolean); }
function queryTokens(q){ return fold(q).split(/\s+/).filter(Boolean); }
function lev1(a, b){                                                   // מרחק עריכה ≤ 1
  if(Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while(i < a.length && i < b.length && a[i] === b[i]) i++;
  if(i === a.length && i === b.length) return true;
  if(a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  return s.slice(i) === l.slice(i + 1);
}
function wordMatches(t, w, fuzzy){
  if(w === t || w.startsWith(t)) return true;
  const base = t.length > 3 ? t.replace(/(ות|ים|ה|ת)$/, '') : t;     // עגבניה / עגבניות
  if(base.length >= 3 && w.startsWith(base)) return true;
  const st = strip(t), sw = strip(w);
  if(st.length >= 3 && (sw === st || sw.startsWith(st))) return true;
  return !!fuzzy && t.length >= 4 && lev1(t, w);
}
function searchIndex(r){
  return r._w || (r._w = { title: words(r.title), cat: words(r.cat), ing: words(r.ingredients.join(' ')), rest: words(r.steps.join(' ') + ' ' + (r.note || '')) });
}
// 0 = אין התאמה. כל מילה בחיפוש חייבת להתאים; התאמה בשם שווה יותר ממצרך, ומצרך יותר מהוראות
function searchScore(r, tokens, fuzzy){
  if(!tokens.length) return 1;
  const ix = searchIndex(r);
  let total = 0;
  for(const t of tokens){
    let best = 0;
    if(ix.title.some(w => wordMatches(t, w, fuzzy))) best = 30;
    else if(ix.cat.some(w => wordMatches(t, w, fuzzy))) best = 10;
    else if(ix.ing.some(w => wordMatches(t, w, fuzzy))) best = 5;
    else if(ix.rest.some(w => wordMatches(t, w, fuzzy))) best = 1;
    if(!best) return 0;
    total += best;
  }
  return total;
}

// ---- כמויות שלא מוכפלות ----
const QTY_RE = new RegExp(String.raw`(?<![\d.,])(${NUM})\s*(גרם|ק"ג|קג|ק״ג|מ"ל|מ״ל|ליטר|ל')(?![א-ת])`, 'g');
// חלקים של טקסט: [{t, q}] כש-q=true לכמות מפורשת (מספר+יחידה). משמש להדגשת כמויות בהוראות שאינן מוכפלות
function splitQuantities(text, k){
  const out = []; let last = 0;
  for(const m of text.matchAll(QTY_RE)){
    if(m.index > last) out.push({ t: text.slice(last, m.index), q: false });
    const p = { t: m[0], q: true };
    if(k && k !== 1){ const sc = scaleLine(m[0], k); if(sc !== m[0]) p.s = sc; }          // ההצעה אם הכמות הזו היא לכל האצווה
    out.push(p); last = m.index + m[0].length;
  }
  if(last < text.length) out.push({ t: text.slice(last), q: false });
  return out;
}
// שורת מצרך שיש בה כמות נוספת מעבר לכמות הפותחת (למשל "(מומס ב-24 גרם מים)" או "לכל 2 ק"ג") – היא לא מוכפלת
function hasUnscaledQty(line){
  const m = line.match(LEAD_RE);
  const rest = (m ? line.slice(m[0].length) : line)
    .replace(/\([^)]*(?:כל אחד|כל אחת|ליחידה|למנה)[^)]*\)/g, '')          // משקל ליחידה: נשאר כמו שהוא בכוונה
    .replace(/\((?:מומס|מעורבב)[^)]*\)/g, '')                              // מוכפל יחד עם הכמות הפותחת
    .replace(/(?:לכל|על)\s+[^,;)]*/g, '');                                  // יחס: "לכל 2 ק"ג"
  return new RegExp(QTY_RE.source).test(rest);
}

// ---- זמנים בהוראות (לטיימרים) ----
const NUMT = String.raw`\d+(?:[.,]\d{1,2})?`;
const HE_NUMS = { 'שתי': 2, 'שני': 2, 'שלוש': 3, 'שלושה': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5, 'שש': 6, 'שישה': 6, 'שבע': 7, 'שבעה': 7, 'שמונה': 8, 'תשע': 9, 'תשעה': 9, 'עשר': 10, 'עשרה': 10 };
const TIME_RE = new RegExp(
  String.raw`(?<![א-ת\d])(?:` +
  String.raw`(?<n1>${NUMT})(?:\s*-\s*(?<n2>${NUMT}))?\s*(?<u>שעות|שעה|דקות|דקה|דק['׳]|שניות|שניה|שנייה)(?:\s+ו(?<f>חצי|רבע)(?![א-ת]))?` +
  String.raw`|(?<nw>${Object.keys(HE_NUMS).join('|')})\s+(?<uw>שעות|דקות|שניות)` +
  String.raw`|[כלבוש]{0,2}(?<w>חצי|רבע)\s+(?<wu>שעה|דקה)` +
  String.raw`|[כלבוש]{0,2}(?<b>שעתיים|שעה|דקה)(?:\s+ו(?<bf>חצי|רבע)(?![א-ת]))?` +
  String.raw`)(?![א-ת])`, 'g');
const unitSec = u => u.startsWith('שע') ? 3600 : u.startsWith('שנ') ? 1 : 60;
const FRAC_WORD = { 'חצי': 0.5, 'רבע': 0.25 };
// מחזיר [{label, sec, max?}] . בטווח ("40-60 דקות") sec הוא החסם התחתון ו-max העליון
function findTimes(text){
  const out = [];
  for(const m of text.matchAll(TIME_RE)){
    const g = m.groups; let sec, max;
    if(g.n1){
      const u = unitSec(g.u), n = parseFloat(g.n1.replace(',', '.'));
      sec = n * u + (g.f ? FRAC_WORD[g.f] * u : 0);
      if(g.n2){ max = parseFloat(g.n2.replace(',', '.')) * u; if(!(max > sec)) max = undefined; }
    } else if(g.nw) sec = HE_NUMS[g.nw] * unitSec(g.uw);
    else if(g.w) sec = FRAC_WORD[g.w] * unitSec(g.wu);
    else { const u = g.b === 'שעתיים' ? 3600 : unitSec(g.b); sec = (g.b === 'שעתיים' ? 2 : 1) * u + (g.bf ? FRAC_WORD[g.bf] * u : 0); }
    if(sec > 0 && sec <= 48 * 3600){
      const t = { label: m[0].replace(/^[כלבוש]{1,2}(?=שע|חצי|רבע|דק)/, '').trim(), sec };
      if(max && max <= 48 * 3600) t.max = max;
      out.push(t);
    }
  }
  return out;
}
function fmtDur(s){
  s = Math.max(0, Math.ceil(s));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0');
}

// ---- גישה למכשירים ----
// תשובת השרת לבקשת נתונים: JSON עם status אחד מארבעה. כל דבר אחר (שרת ישן, שגיאת HTML) נחשב לא מוכר.
const ACCESS_STATUSES = ['ok', 'pending', 'blocked', 'unknown'];
function parseAccess(text){
  try{
    const o = JSON.parse(text);
    return o && typeof o === 'object' && ACCESS_STATUSES.includes(o.status) ? o : null;
  }catch(e){ return null; }
}
// עותק שמור במכשיר תקף 14 ימים בלי אימות מול השרת. אחרי זה נדרש חיבור, וכך גם מכשיר שנחסם נחסם בפועל.
const OFFLINE_MAX_MS = 14 * 24 * 3600e3;
function cacheValid(ts, nowMs){ return typeof ts === 'number' && isFinite(ts) && nowMs - ts >= -3600e3 && nowMs - ts <= OFFLINE_MAX_MS; }
// מזהה מכשיר: 16 בתים אקראיים כ-32 תווי hex
function newDeviceId(bytes){ return Array.from(bytes, b => (b & 255).toString(16).padStart(2, '0')).join(''); }
const isDeviceId = v => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);

const api = { NUM, scaleAll, parseCSV, lines, fmtNum, toNum, scaleLine, scaleAll, scaleYield, yieldText, parseMultiplier, parseVariants, parseTable, parseAllergens,
  validatePortions, validateYield, COLUMNS, REQUIRED, fold, queryTokens, searchScore, splitQuantities, hasUnscaledQty, findTimes, fmtDur,
  parseAccess, cacheValid, newDeviceId, isDeviceId, OFFLINE_MAX_MS };
if(typeof module === 'object' && module.exports) module.exports = api; else root.RB = api;
})(typeof self !== 'undefined' ? self : this);
