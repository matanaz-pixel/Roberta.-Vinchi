/**
 * בקשות תיקון לספר המתכונים.
 *
 * התקנה (חד-פעמית):
 * 1. בגיליון: הרחבות > Apps Script. מוחקים את מה שיש, מדביקים את הקובץ הזה ושומרים.
 * 2. פריסה > פריסה חדשה > סוג: אפליקציית אינטרנט. ביצוע בתור: אני. מי יכול לגשת: כל אחד.
 * 3. מאשרים הרשאות. אם מופיע "Google לא אימתה את האפליקציה": Advanced > Go to (unsafe). זה הסקריפט שלך.
 * 4. מעתיקים את כתובת ה-Web App (מסתיימת ב-/exec) ל-CORRECTION_URL ב-recipes.html.
 * אחרי שינוי בקוד: פריסה > ניהול פריסות > עריכה > גרסה חדשה (אחרת הכתובת ממשיכה להריץ את הגרסה הקודמת).
 *
 * חשוב: כל מי שיכול לערוך את הגיליון יכול גם לאשר בקשות ולאשר מכשירים. לא משתפים אותו לעריכה.
 *
 * אישור מכשירים (גישה לספר):
 * הספר נטען דרך הסקריפט הזה ולא ישירות מהגיליון, ולכן הגיליון אמור להיות פרטי (שיתוף: מוגבל). הסקריפט רץ בשמך, ולכן הוא יכול לקרוא אותו.
 * טבח שפותח את הספר בפעם הראשונה כותב את שמו ולוחץ "בקש גישה". נוספת שורה בטאב "מכשירים" (נוצר אוטומטית).
 * מסמנים וי בעמודת "מאושר" והספר נפתח אצלו. מסירים את הוי והמכשיר נחסם (בפעם הבאה שיש לו חיבור לשרת).
 * "קוד" הוא 4 תווים שהטבח רואה על המסך, כדי להבדיל בין שני טבחים עם אותו שם.
 * מתכונים נוספים שלא בטאב recipes אפשר לשים בטאב "recipes-extra" (אותן עמודות). הוא נשלח לטבחים מאושרים בלבד.
 *
 * הזרימה: הטבח בוחר מתכון ומשנה כמויות (שדה לכל מצרך) ו/או את הוראות ההכנה > האתר שולח בקשה (doPost) >
 * נוספת שורה בטאב "בקשות תיקון" בסטטוס "ממתין", עם עמודת "מה השתנה" (לפני/אחרי) >
 * בוחרים "אושר" בעמודת הסטטוס (אפשר כמה שורות יחד) > onEdit מעדכן את טאב המתכונים.
 * בקשה שמשנה גם כמויות וגם הוראות הכנה נרשמת כשתי שורות, שכל אחת מהן מאושרת בנפרד.
 */
const RECIPES_SHEET = 'recipes';
const REQUESTS_SHEET = 'בקשות תיקון';
const FIELDS = { 'שם': 'שם', 'מצרכים': 'מצרכים', 'הוראות הכנה': 'הוראות הכנה', 'הערות': 'הערות' };   // שדה > כותרת העמודה בטאב המתכונים
const HEADERS = ['זמן', 'קטגוריה', 'שם מתכון', 'שדה', 'הנוסח שהטבח ראה', 'נוסח מוצע', 'מה השתנה', 'הערה', 'שולח', 'סטטוס'];
const STATUS_COL = 10;
const ST = { PENDING: 'ממתין', APPROVED: 'אושר', FORCE: 'אשר בכל מקרה', REJECTED: 'נדחה', APPLIED: 'הוחל', CONFLICT: 'התנגשות', NOTFOUND: 'מתכון לא נמצא' };
const RATE_PER_SENDER = 10;       // בקשות לכל 10 דקות, לכל שם שולח
const RATE_GLOBAL = 120;          // בקשות לכל 10 דקות, לכולם יחד (תקרת חירום נגד הצפה)
const WINDOW_MS = 10 * 60 * 1000; // חלון קבוע: הספירה מתאפסת בתחילת כל חלון, ולא מתארכת עם כל בקשה
const NOTIFY_OWNER = true;        // מייל לבעלים, לכל היותר פעם בשעה
const DEVICES_SHEET = 'מכשירים';
const EXTRA_SHEET = 'recipes-extra';
const DEV_HEADERS = ['זמן בקשה', 'שם', 'קוד', 'מאושר', 'נראה לאחרונה', 'מזהה (מוצפן, לא לגעת)', 'תפקיד'];
const DEV_APPROVED = 4, DEV_SEEN = 5, DEV_HASH = 6, DEV_ROLE = 7;
const ADMIN_ROLE = 'מנהל';         // כתבו "מנהל" בעמודת "תפקיד" כדי שהמכשיר יראה את טאב המנהל באפליקציית המלאי
const DEV_REQ_GLOBAL = 20;        // בקשות גישה חדשות לכל 10 דקות, לכולם יחד
const DEV_PENDING_MAX = 100;      // תקרה לבקשות שלא אושרו. מעבר לזה נדחות עד שמנקים את הטאב
const WAITERS_SHEET = 'מלצרים';          // מבחן התפריט: עמודות "שם" ו"קוד". מוסיפים כאן שורה לכל מלצר (הטאב נוצר אוטומטית)
const QUIZ_RESULTS_SHEET = 'תוצאות מבחן';
const QUIZ_EMAIL = '';                    // לאן נשלחות תוצאות המבחן. ריק = המייל שלך (הבעלים של הסקריפט)
const QUIZ_MAX_PER_DAY = 3;               // כמה פעמים ביום אפשר לשלוח תוצאה עם אותו קוד
const STOCK_TABS = { cold: 'מלאי-פס קר', hot: 'מלאי-פס חם', tabun: 'מלאי-טאבון' };   // טאב לכל פס (אפליקציית המלאי)
const STOCK_MAX_CSV = 300000;     // תקרת גודל לטאב מלאי. מעבר לזה הטאב לא נשלח (חותכים ושולחים CSV שבור זה גרוע יותר)
const SEEN_EVERY_S = 3600;        // "נראה לאחרונה" מתעדכן לכל היותר פעם בשעה למכשיר

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.a === 'data') return handleData(p.d);
    if (p.a === 'stock') return handleStock(p.d);
    if (p.a === 'quizcode') return reply(waiterByCode(p.c) ? 'ok' : 'bad');
  } catch (err) {
    return reply('error');
  }
  return reply('ok');
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.website) return reply('ok');                       // מלכודת לבוטים
    if (d.a === 'request') return handleRequest(d);          // בקשת גישה של מכשיר חדש
    if (d.a === 'quiz') return handleQuiz(d);                // תוצאת מבחן תפריט
    const cat = clip(d.cat, 100).trim(), title = clip(d.title, 200).trim(), field = clip(d.field, 30);
    const proposed = clip(d.proposed, 5000).trim();
    const sender = clean(clip(d.sender, 60)).trim();
    if (!proposed || !Object.prototype.hasOwnProperty.call(FIELDS, field) || !sender) return reply('invalid');
    const dev = lookupDevice(d.dev);
    if (!dev || !dev.approved) return reply('denied');       // בקשות תיקון רק ממכשיר מאושר

    lock.waitLock(15000); locked = true;                     // הספירה והכתיבה מתבצעות תחת נעילה, כדי שבקשות מקבילות לא יעקפו את המגבלה
    if (!rateOk(dev.key)) return reply('busy');          // המגבלה לפי המכשיר, לא לפי השם שהלקוח שולח
    const recipes = SpreadsheetApp.getActive().getSheetByName(RECIPES_SHEET);
    const row = findRecipeRow(recipes, cat, title);
    if (!row) return reply('unknown');
    const current = String(recipes.getRange(row, columnOf(recipes, FIELDS[field])).getValue());
    if (norm(current) === norm(proposed)) return reply('same');
    // בסיס ההשוואה הוא תמיד הנוסח שבגיליון עכשיו (נקבע בשרת, לא מהלקוח). כך "מה השתנה" ובדיקת ההתנגשות באישור אמינים.
    // אם הטבח ראה נוסח אחר ממה שבגיליון, זה נרשם בהערה, והבקשה נשארת לבדיקה ידנית.
    let comment = clean(clip(d.comment, 300));
    if (d.base != null && norm(clip(d.base, 5000)) !== norm(current)) comment = ('[הגיליון השתנה מאז שהטבח ראה את המתכון] ' + comment).trim();

    const sh = requestsSheet();
    if (isDuplicate(sh, cat, title, field, proposed)) return reply('ok');
    sh.appendRow([new Date(), cat, title, field, current, proposed, summarize(current, proposed), comment, sender + ' [' + clean(dev.name) + ']', ST.PENDING].map(safe));
    notify();
    return reply('ok');
  } catch (err) {
    return reply('error');
  } finally {
    if (locked) { try { lock.releaseLock(); } catch (x) {} }
  }
}

// ---- אישור מכשירים ----
function json(o) { return reply(JSON.stringify(o)); }

// גיבוב של מזהה המכשיר. בגיליון נשמר רק הגיבוב, כך שמי שרואה את הגיליון לא יכול להתחזות למכשיר מאושר.
// הקידומת h מונעת מהגיליון לפרש מחרוזת של ספרות ו-e כמספר.
function devKey(id) {
  id = String(id == null ? '' : id);
  if (!/^[a-f0-9]{32}$/.test(id)) return '';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, id);
  return 'h' + Array.from(bytes, b => ('0' + (b & 255).toString(16)).slice(-2)).join('').slice(0, 32);
}
const devCode = key => key.slice(1, 5).toUpperCase();
const isTrue = v => v === true || String(v).trim().toUpperCase() === 'TRUE';

function devicesSheet() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(DEVICES_SHEET);
  if (sh) return sh;
  sh = ss.insertSheet(DEVICES_SHEET, ss.getSheets().length);
  sh.appendRow(DEV_HEADERS);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, DEV_HEADERS.length).setFontWeight('bold');
  sh.hideColumns(DEV_HASH);       // תיבות הסימון נוספות שורה-שורה: תיבות ריקות בעמודה שלמה נספרות כשורות עם תוכן ושוברות את getLastRow
  return sh;
}

/** מוצא מכשיר לפי המזהה שהלקוח שלח. מחזיר null אם המזהה לא תקין או לא קיים. */
function lookupDevice(id) {
  const key = devKey(id);
  const sh = SpreadsheetApp.getActive().getSheetByName(DEVICES_SHEET);
  if (!key || !sh || sh.getLastRow() < 2) return null;
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, DEV_HEADERS.length).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][DEV_HASH - 1] === key) {
      return { sh, row: i + 2, key, name: String(rows[i][1]), approved: isTrue(rows[i][DEV_APPROVED - 1]), seen: rows[i][DEV_SEEN - 1], admin: String(rows[i][DEV_ROLE - 1]).trim() === ADMIN_ROLE };
    }
  }
  return null;
}

function devStatus(dev) {
  return { status: dev.approved ? 'ok' : (dev.seen ? 'blocked' : 'pending'), name: dev.name, code: devCode(dev.key) };
}

/** בדיקת מכשיר משותפת לכל פעולות הקריאה. מחזיר {st} לתשובה מיידית (לא מאושר), או {st, dev} למכשיר מאושר. מעדכן "נראה לאחרונה". */
function approvedDevice(id) {
  const dev = lookupDevice(id);
  if (!dev) return { st: { status: 'unknown' } };
  const st = devStatus(dev);
  if (st.status !== 'ok') return { st };
  const cache = CacheService.getScriptCache();
  if (!cache.get('seen-' + dev.key)) {
    cache.put('seen-' + dev.key, '1', SEEN_EVERY_S);
    dev.sh.getRange(dev.row, DEV_SEEN).setValue(new Date());
  }
  return { st, dev };
}

/** doGet?a=data&d=<מזהה>: מחזיר את המתכונים רק למכשיר מאושר. */
function handleData(id) {
  const r = approvedDevice(id);
  if (!r.dev) return json(r.st);
  r.st.csv = sheetCsv(RECIPES_SHEET);
  r.st.extra = sheetCsv(EXTRA_SHEET);
  return json(r.st);
}

/** doGet?a=stock&d=<מזהה>: הגדרות המלאי של שלושת הפסים (CSV לכל פס) למכשיר מאושר. טאב חסר או שבור = מחרוזת ריקה, ו-errors מסביר. */
function handleStock(id) {
  const r = approvedDevice(id);
  if (!r.dev) return json(r.st);
  r.st.admin = r.dev.admin === true;
  r.st.stations = {};
  if (r.st.admin) { try { r.st.lint = stockLint(); } catch (err) { r.st.lint = []; } }
  Object.keys(STOCK_TABS).forEach(k => {
    try {
      const csv = sheetCsv(STOCK_TABS[k]);
      if (csv.length > STOCK_MAX_CSV) { r.st.stations[k] = ''; (r.st.errors = r.st.errors || {})[k] = 'too_big'; }
      else r.st.stations[k] = csv;
    } catch (err) {
      r.st.stations[k] = ''; (r.st.errors = r.st.errors || {})[k] = 'read_failed';
    }
  });
  return json(r.st);
}


/** בדיקת תקינות לגיליון: מוצר בטאב מלאי שעמודת "מתכון" שלו מצביעה על שם שאין בטאב המתכונים. מוצג רק למנהל. */
function stockLint() {
  const titles = {};
  [RECIPES_SHEET, EXTRA_SHEET].forEach(nm => {
    const sh = SpreadsheetApp.getActive().getSheetByName(nm);
    if (!sh || sh.getLastRow() < 2) return;
    const tc = columnOf(sh, 'שם');
    if (!tc) return;
    sh.getRange(2, tc, sh.getLastRow() - 1, 1).getValues().forEach(r => { const t = String(r[0]).trim(); if (t) titles[t] = true; });
  });
  const out = [];
  Object.keys(STOCK_TABS).forEach(k => {
    const sh = SpreadsheetApp.getActive().getSheetByName(STOCK_TABS[k]);
    if (!sh || sh.getLastRow() < 2) return;
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
    const pc = head.indexOf('מוצר'), rc = head.indexOf('מתכון');
    if (pc < 0 || rc < 0) return;
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().forEach(r => {
      const name = String(r[pc]).trim(), rec = String(r[rc]).trim();
      if (name && rec && !titles[rec] && out.length < 40) out.push({ st: k, product: clean(name).slice(0, 60), recipe: clean(rec).slice(0, 60) });
    });
  });
  return out;
}

/** doPost {a:'request', dev, name}: בקשת גישה של מכשיר חדש. מכשיר שכבר קיים לא מקבל שורה נוספת. */
function handleRequest(d) {
  const name = clean(clip(d.name, 60)).trim(), key = devKey(d.dev);
  if (!name || !key) return reply('invalid');
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    lock.waitLock(15000); locked = true;
    const sh = devicesSheet();
    const existing = lookupDevice(d.dev);
    if (existing) return json(devStatus(existing));
    if (!windowOk('dq', DEV_REQ_GLOBAL)) return reply('busy');
    // שורת מכשיר = שורה שיש בה מזהה. שורות ריקות (או עם תיבת סימון בלבד) לא נספרות.
    const last = sh.getLastRow();
    const rows = last >= 2 ? sh.getRange(2, 1, last - 1, DEV_HEADERS.length).getValues() : [];
    let lastDevice = 1, pending = 0;
    rows.forEach((r, i) => { if (r[DEV_HASH - 1]) { lastDevice = i + 2; if (!isTrue(r[DEV_APPROVED - 1])) pending++; } });
    if (pending >= DEV_PENDING_MAX) return reply('busy');
    const at = lastDevice + 1;
    sh.getRange(at, 1, 1, DEV_HEADERS.length).setValues([[new Date(), name, "'" + devCode(key), false, '', key, ''].map(safe)]);
    sh.getRange(at, DEV_APPROVED).insertCheckboxes();
    notify('מכשיר חדש מבקש גישה לספר המתכונים', name + ' (קוד ' + devCode(key) + ')\nלאישור: טאב "' + DEVICES_SHEET + '", וי בעמודת "מאושר"\n' + SpreadsheetApp.getActive().getUrl(), 'notified-dev');
    return json({ status: 'pending', name, code: devCode(key) });
  } finally {
    if (locked) { try { lock.releaseLock(); } catch (x) {} }
  }
}

function sheetCsv(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 1) return '';
  const rows = sh.getDataRange().getDisplayValues();
  while (rows.length && rows[rows.length - 1].every(c => c === '')) rows.pop();
  const q = v => /[",\n\r]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  return rows.map(r => r.map(q).join(',')).join('\n');
}

/** מונה בחלון קבוע (כמו rateOk). נקרא רק תחת נעילה. */
function windowOk(name, limit) {
  const cache = CacheService.getScriptCache();
  const k = name + '-' + Math.floor(Date.now() / WINDOW_MS);
  const n = Number(cache.get(k) || 0) + 1;
  if (n > limit) return false;
  cache.put(k, String(n), 1200);
  return true;
}

/** מופעל אוטומטית בכל עריכה בגיליון. פועל רק על עמודת הסטטוס בטאב הבקשות, גם בהדבקה על כמה שורות. */
function onEdit(e) {
  const range = e.range, sh = range.getSheet();
  if (sh.getName() !== REQUESTS_SHEET) return;
  const c0 = range.getColumn(), c1 = c0 + range.getNumColumns() - 1;
  if (STATUS_COL < c0 || STATUS_COL > c1) return;
  const r0 = Math.max(range.getRow(), 2), r1 = range.getRow() + range.getNumRows() - 1;
  for (let r = r0; r <= r1; r++) {
    const status = String(sh.getRange(r, STATUS_COL).getValue()).trim();
    if (status === ST.APPROVED || status === ST.FORCE) applyRequest(sh, r, status === ST.FORCE);
  }
}

function applyRequest(sh, r, force) {
  const [, cat, title, field, base, proposed] = sh.getRange(r, 1, 1, 6).getValues()[0];
  const statusCell = sh.getRange(r, STATUS_COL);
  const recipes = SpreadsheetApp.getActive().getSheetByName(RECIPES_SHEET);
  const row = findRecipeRow(recipes, cat, title);
  const col = Object.prototype.hasOwnProperty.call(FIELDS, field) ? columnOf(recipes, FIELDS[field]) : 0;
  if (!row || !col) { statusCell.setValue(ST.NOTFOUND); return; }   // למשל אם שם המתכון שונה מאז הבקשה
  const cell = recipes.getRange(row, col);
  if (!force && norm(String(cell.getValue())) !== norm(String(base))) {
    statusCell.setValue(ST.CONFLICT);                        // המתכון שונה מאז הבקשה: בודקים ידנית או "אשר בכל מקרה"
    return;
  }
  cell.setValue(safe(String(proposed)));
  statusCell.setValue(ST.APPLIED);
}

function requestsSheet() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(REQUESTS_SHEET);
  if (sh) return sh;
  sh = ss.insertSheet(REQUESTS_SHEET, ss.getSheets().length);
  sh.appendRow(HEADERS);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  sh.setColumnWidths(5, 2, 320);
  sh.getRange(2, STATUS_COL, sh.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(ST).map(k => ST[k]), true).setAllowInvalid(true).build());
  return sh;
}

function columnOf(sheet, name) {
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
  return header.indexOf(name) + 1;
}

function findRecipeRow(sheet, cat, title) {
  const cc = columnOf(sheet, 'קטגוריה'), tc = columnOf(sheet, 'שם');
  if (!cc || !tc || sheet.getLastRow() < 2) return 0;
  const n = sheet.getLastRow() - 1;
  const cats = sheet.getRange(2, cc, n, 1).getValues(), titles = sheet.getRange(2, tc, n, 1).getValues();
  for (let i = 0; i < n; i++) {
    if (String(cats[i][0]).trim() === String(cat).trim() && String(titles[i][0]).trim() === String(title).trim()) return i + 2;
  }
  return 0;
}

function isDuplicate(sh, cat, title, field, proposed) {
  const last = sh.getLastRow();
  if (last < 2) return false;
  const from = Math.max(2, last - 49);
  const rows = sh.getRange(from, 1, last - from + 1, STATUS_COL).getValues();
  return rows.some(r => r[1] === safe(cat) && r[2] === safe(title) && r[3] === field && norm(r[5]) === norm(safe(proposed)) && r[STATUS_COL - 1] === ST.PENDING);
}

// תקציר קריא של השינוי, כדי שאפשר יהיה לאשר בלי להשוות שני תאים ארוכים
function summarize(base, proposed) {
  const a = String(base).split('\n').map(x => x.trim()).filter(Boolean);
  const b = String(proposed).split('\n').map(x => x.trim()).filter(Boolean);
  if (a.length !== b.length) return 'מספר השורות השתנה: ' + a.length + ' ← ' + b.length;
  const out = [];
  a.forEach((x, i) => { if (x !== b[i]) out.push('לפני: ' + x + '\nאחרי: ' + b[i]); });
  return out.slice(0, 15).join('\n\n') + (out.length > 15 ? '\n... ועוד ' + (out.length - 15) : '');
}

// חלון קבוע ולא נגלל: המפתח כולל את מספר החלון, ולכן בקשות נוספות לא מאריכות את הספירה. נקרא רק תחת נעילה.
function rateOk(sender) {
  const cache = CacheService.getScriptCache();
  const w = Math.floor(Date.now() / WINDOW_MS);
  const kSender = 'rs-' + w + '-' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, sender.toLowerCase())).slice(0, 12);
  const kAll = 'rg-' + w;
  const ns = Number(cache.get(kSender) || 0) + 1, ng = Number(cache.get(kAll) || 0) + 1;
  if (ns > RATE_PER_SENDER || ng > RATE_GLOBAL) return false;
  cache.put(kSender, String(ns), 1200);
  cache.put(kAll, String(ng), 1200);
  return true;
}

function notify(subject, body, flag) {
  if (!NOTIFY_OWNER) return;
  const cache = CacheService.getScriptCache();
  flag = flag || 'notified';
  if (cache.get(flag)) return;
  cache.put(flag, '1', 3600);
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
      subject || 'יש בקשות תיקון חדשות בספר המתכונים',
      body || 'לאישור: טאב "' + REQUESTS_SHEET + '" בגיליון\n' + SpreadsheetApp.getActive().getUrl());
  } catch (err) {}
}

// ============ מבחן תפריט ============
// האתר (menu/quiz.html) בונה את המבחן ומחשב ציון. כאן מאמתים את הקוד של המלצר, רושמים בטאב ושולחים מייל.
// הקוד מגיע מהטאב "מלצרים". הציון מחושב בדפדפן, ולכן הוא לא הוכחה: מתאים לבדיקה פנימית, לא להחלטות שכר או פיטורים.
function waiterByCode(code) {
  code = clean(clip(code, 30)).trim();
  if (!code) return null;
  const sh = SpreadsheetApp.getActive().getSheetByName(WAITERS_SHEET);
  if (!sh) return null;
  const rows = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]).trim() === code && String(rows[i][0]).trim()) return { name: String(rows[i][0]).trim() };
  }
  return null;
}

function handleQuiz(d) {
  const w = waiterByCode(d.code);
  if (!w) return reply('badcode');
  const total = Math.round(Number(d.total)), right = Math.round(Number(d.right));
  if (!(total >= 1 && total <= 100) || !(right >= 0 && right <= total)) return reply('invalid');
  const code = clean(clip(d.code, 30)).trim();
  const day = Utilities.formatDate ? Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyyMMdd') : String(new Date().getUTCDate());
  const cache = CacheService.getScriptCache(), key = 'quiz-' + code + '-' + day;
  const n = Number(cache.get(key) || 0);
  if (n >= QUIZ_MAX_PER_DAY) return reply('busy');
  cache.put(key, String(n + 1), 86400);
  const pct = Math.round(right * 100 / total), pass = pct >= 70;
  const wrong = (Array.isArray(d.wrong) ? d.wrong : []).slice(0, 40).map(x =>
    '• ' + clean(clip(x && x.q, 200)) + '\n   ענה: ' + clean(clip(x && x.chosen, 120)) + ' | נכון: ' + clean(clip(x && x.correct, 120)));
  let sh = SpreadsheetApp.getActive().getSheetByName(QUIZ_RESULTS_SHEET);
  if (!sh) { sh = SpreadsheetApp.getActive().insertSheet(QUIZ_RESULTS_SHEET); sh.appendRow(['זמן', 'שם', 'קוד', 'ציון %', 'נכונות', 'סה"כ', 'עבר', 'טעויות', 'גרסה']); }
  sh.appendRow([new Date(), w.name, code, pct, right, total, pass ? 'כן' : 'לא', wrong.join('\n'), clean(clip(d.version, 12))].map(safe));
  try {
    MailApp.sendEmail(QUIZ_EMAIL || Session.getEffectiveUser().getEmail(),
      'מבחן תפריט: ' + w.name + ', ' + pct + '% (' + (pass ? 'עבר' : 'לא עבר') + ')',
      'גרסה ' + clean(clip(d.version, 12)) + '. ' + w.name + ' ענה נכון על ' + right + ' מתוך ' + total + ' (' + pct + '%).\n' + (pass ? 'עבר' : 'לא עבר') + ' (ציון עובר: 70%).\n\n' +
      (wrong.length ? 'טעויות:\n' + wrong.join('\n') : 'בלי טעויות.'));
  } catch (err) {}
  return reply('ok');
}

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
const norm = s => String(s).replace(/^'/, '').replace(/\r/g, '').split('\n').map(x => x.trim()).filter(Boolean).join('\n');
const clean = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');   // תווי בקרה ותווי כיוון נסתרים
const safe = s => (typeof s === 'string' && /^[\s\u0000-\u001F]*[=+\-@]/.test(s) ? "'" + s : s);   // מונע פרשנות כנוסחה (גם אחרי רווח/טאב)
const reply = s => ContentService.createTextOutput(s);

// ============ דוח שבועי במייל ============
// הפעלה חד-פעמית: בעורך הסקריפט בוחרים את הפונקציה setupWeeklyReport ולוחצים "הפעל". נוצר טריגר שרץ בכל יום ראשון בבוקר.
// בדיקה ידנית: הפעלת weeklyReport. הדוח נשלח למייל של בעל הגיליון.
const FB_URL = 'https://roberta-s-breaks-default-rtdb.europe-west1.firebasedatabase.app';
const REPORT_DAYS = 7;
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const STATION_NAMES = { cold: 'פס קר', hot: 'פס חם', tabun: 'טאבון' };

function setupWeeklyReport() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'weeklyReport').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('weeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(7).create();
}

const sanitizeKeyGs = name => {
  let s = String(name == null ? '' : name).trim().replace(/[.$#\[\]\/\u0000-\u001F\u007F]/g, '_');
  s = Array.from(s).slice(0, 60).join('');
  return s === '__proto__' ? '_proto_' : s;
};
const dayOfKey = key => new Date(key + 'T12:00:00Z').getUTCDay();

function fbGet(path) {
  const r = UrlFetchApp.fetch(FB_URL + '/' + path + '.json', { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  try { return JSON.parse(r.getContentText()); } catch (e) { return null; }
}

/** מגדרות המוצרים מטאבי המלאי: { cold: [{name, unit, base:[7]}] } */
function stockDefsFromSheets() {
  const out = {};
  Object.keys(STOCK_TABS).forEach(k => {
    out[k] = [];
    const sh = SpreadsheetApp.getActive().getSheetByName(STOCK_TABS[k]);
    if (!sh || sh.getLastRow() < 2) return;
    const rows = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    const head = rows[0].map(h => String(h).trim());
    const pi = head.indexOf('מוצר'), ui = head.indexOf('יחידה');
    const di = DAY_NAMES.map(d => head.indexOf(d));
    if (pi < 0 || di.some(i => i < 0)) return;
    rows.slice(1).forEach(r => {
      const name = String(r[pi]).trim(); if (!name) return;
      out[k].push({ name, unit: ui >= 0 ? String(r[ui]).trim() : '', base: di.map(i => { const v = parseFloat(String(r[i]).replace(',', '.')); return isFinite(v) && v > 0 ? v : null; }) });
    });
  });
  return out;
}

function latestOf(counts) {
  let best = null;
  Object.keys(counts || {}).forEach(id => { const c = counts[id]; if (c && typeof c.t === 'number' && (!best || c.t > best.t)) best = { id, t: c.t, by: String(c.by || ''), items: c.items || {} }; });
  return best;
}

/** פונקציה טהורה, כדי שאפשר לבדוק אותה. data: { dates:[ישן..חדש], counts:{date:{st:{id:{t,by,items}}}}, prep:{date:{st:{id:{items}}}}, defs, pending, lint } */
function buildReport(data) {
  const L = [];
  L.push('דוח שבועי: רוברטה וינצ\'י');
  L.push(data.dates[0] + ' עד ' + data.dates[data.dates.length - 1]);
  L.push('');
  // 1. ימים שפסים לא נספרו
  L.push('ספירות לפי פס (✓ נספר, ✗ לא נספר):');
  Object.keys(STATION_NAMES).forEach(st => {
    const cells = data.dates.map(d => latestOf(((data.counts[d] || {})[st])) ? '✓' : '✗');
    const missing = data.dates.filter((d, i) => cells[i] === '✗' && (data.defs[st] || []).some(p => p.base[dayOfKey(d)] !== null)).map(d => DAY_NAMES[dayOfKey(d)]);
    L.push(STATION_NAMES[st] + ': ' + cells.join(' ') + (missing.length ? '  ← לא נספר ביום: ' + missing.join(', ') : ''));
  });
  L.push('');
  // 2. צריכה בפועל מול הבסיס
  const stats = {};   // st|name -> {sum, n, baseSum, unit}
  data.dates.forEach((d, i) => {
    if (i === 0) return;
    const prev = data.dates[i - 1];
    Object.keys(STATION_NAMES).forEach(st => {
      const a = latestOf((data.counts[prev] || {})[st]), b = latestOf((data.counts[d] || {})[st]);
      if (!a || !b) return;
      const pr = (((data.prep[prev] || {})[st]) || {})[a.id];
      (data.defs[st] || []).forEach(p => {
        const key = sanitizeKeyGs(p.name), base = p.base[dayOfKey(prev)];
        const s0 = a.items[key], e0 = b.items[key];
        if (typeof s0 !== 'number' || typeof e0 !== 'number' || base === null) return;
        const used = Math.round((s0 + (pr && typeof pr.items[key] === 'number' ? pr.items[key] : 0) - e0) * 100) / 100;
        if (used < 0) return;      // כנראה נכנסה סחורה
        const k = st + '|' + p.name, o = stats[k] || (stats[k] = { st, name: p.name, unit: p.unit, sum: 0, n: 0, baseSum: 0 });
        o.sum += used; o.n += 1; o.baseSum += base;
      });
    });
  });
  const rows = Object.keys(stats).map(k => stats[k]).filter(o => o.n >= 2).map(o => ({ ...o, avg: o.sum / o.n, base: o.baseSum / o.n })).map(o => ({ ...o, ratio: o.avg / o.base }));
  const off = rows.filter(o => o.ratio > 1.25 || o.ratio < 0.6).sort((x, y) => Math.abs(Math.log(y.ratio)) - Math.abs(Math.log(x.ratio))).slice(0, 8);
  L.push('צריכה בפועל מול הבסיס בגיליון (ממוצע, רק מוצרים עם לפחות שתי מדידות):');
  if (!rows.length) L.push('עדיין אין מספיק ספירות רצופות כדי לחשב.');
  else if (!off.length) L.push('הבסיסים תואמים את הצריכה (בטווח ‎-40%‎ עד ‎+25%‎).');
  else off.forEach(o => L.push('• ' + STATION_NAMES[o.st] + ' · ' + o.name + ': נצרך בממוצע ' + (Math.round(o.avg * 10) / 10) + ' ' + o.unit + ', הבסיס ' + (Math.round(o.base * 10) / 10) + (o.ratio > 1 ? '  ← כדאי להעלות' : '  ← כדאי להוריד')));
  L.push('');
  L.push('בקשות תיקון שממתינות: ' + data.pending);
  if (data.lint && data.lint.length) { L.push(''); L.push('מוצרים שהמתכון שלהם לא קיים בספר (' + data.lint.length + '):'); data.lint.slice(0, 10).forEach(x => L.push('• ' + (STATION_NAMES[x.st] || x.st) + ': ' + x.product + ' ← ' + x.recipe)); }
  L.push('');
  L.push('הגיליון: ' + data.url);
  return L.join('\n');
}

function weeklyReport() {
  const tz = 'Asia/Jerusalem', now = new Date();
  const dates = [];
  for (let i = REPORT_DAYS; i >= 1; i--) dates.push(Utilities.formatDate(new Date(now.getTime() - i * 86400000), tz, 'yyyy-MM-dd'));
  const counts = {}, prep = {};
  dates.forEach(d => { counts[d] = fbGet('stock/' + d) || {}; prep[d] = fbGet('stockPrep/' + d) || {}; });
  let pending = 0;
  try {
    const rq = SpreadsheetApp.getActive().getSheetByName(REQUESTS_SHEET);
    if (rq && rq.getLastRow() > 1) pending = rq.getRange(2, STATUS_COL, rq.getLastRow() - 1, 1).getValues().filter(r => String(r[0]).trim() === ST.PENDING).length;
  } catch (e) {}
  let lint = []; try { lint = stockLint(); } catch (e) {}
  const text = buildReport({ dates, counts, prep, defs: stockDefsFromSheets(), pending, lint, url: SpreadsheetApp.getActive().getUrl() });
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'דוח שבועי: מלאי והכנות', text);
  return text;
}
