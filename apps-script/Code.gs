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
const DEV_HEADERS = ['זמן בקשה', 'שם', 'קוד', 'מאושר', 'נראה לאחרונה', 'מזהה (מוצפן, לא לגעת)'];
const DEV_APPROVED = 4, DEV_SEEN = 5, DEV_HASH = 6;
const DEV_REQ_GLOBAL = 20;        // בקשות גישה חדשות לכל 10 דקות, לכולם יחד
const DEV_PENDING_MAX = 100;      // תקרה לבקשות שלא אושרו. מעבר לזה נדחות עד שמנקים את הטאב
const SEEN_EVERY_S = 3600;        // "נראה לאחרונה" מתעדכן לכל היותר פעם בשעה למכשיר

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.a === 'data') return handleData(p.d);
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
    const cat = clip(d.cat, 100).trim(), title = clip(d.title, 200).trim(), field = clip(d.field, 30);
    const proposed = clip(d.proposed, 5000).trim();
    const sender = clean(clip(d.sender, 60)).trim();
    if (!proposed || !FIELDS[field] || !sender) return reply('invalid');
    const dev = lookupDevice(d.dev);
    if (!dev || !dev.approved) return reply('denied');       // בקשות תיקון רק ממכשיר מאושר

    lock.waitLock(15000); locked = true;                     // הספירה והכתיבה מתבצעות תחת נעילה, כדי שבקשות מקבילות לא יעקפו את המגבלה
    if (!rateOk(sender)) return reply('busy');
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
    sh.appendRow([new Date(), cat, title, field, current, proposed, summarize(current, proposed), comment, sender, ST.PENDING].map(safe));
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
  sh.getRange(2, DEV_APPROVED, sh.getMaxRows() - 1, 1).insertCheckboxes();
  sh.hideColumns(DEV_HASH);
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
      return { sh, row: i + 2, key, name: String(rows[i][1]), approved: isTrue(rows[i][DEV_APPROVED - 1]), seen: rows[i][DEV_SEEN - 1] };
    }
  }
  return null;
}

function devStatus(dev) {
  return { status: dev.approved ? 'ok' : (dev.seen ? 'blocked' : 'pending'), name: dev.name, code: devCode(dev.key) };
}

/** doGet?a=data&d=<מזהה>: מחזיר את המתכונים רק למכשיר מאושר. */
function handleData(id) {
  const dev = lookupDevice(id);
  if (!dev) return json({ status: 'unknown' });
  const st = devStatus(dev);
  if (st.status !== 'ok') return json(st);
  const cache = CacheService.getScriptCache();
  if (!cache.get('seen-' + dev.key)) {
    cache.put('seen-' + dev.key, '1', SEEN_EVERY_S);
    dev.sh.getRange(dev.row, DEV_SEEN).setValue(new Date());
  }
  st.csv = sheetCsv(RECIPES_SHEET);
  st.extra = sheetCsv(EXTRA_SHEET);
  return json(st);
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
    const last = sh.getLastRow();
    if (last >= 2) {
      const pending = sh.getRange(2, DEV_APPROVED, last - 1, 1).getValues().filter(r => !isTrue(r[0])).length;
      if (pending >= DEV_PENDING_MAX) return reply('busy');
    }
    sh.appendRow([new Date(), name, "'" + devCode(key), false, '', key].map(safe));
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
  const col = FIELDS[field] ? columnOf(recipes, FIELDS[field]) : 0;
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

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
const norm = s => String(s).replace(/^'/, '').replace(/\r/g, '').split('\n').map(x => x.trim()).filter(Boolean).join('\n');
const clean = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');   // תווי בקרה ותווי כיוון נסתרים
const safe = s => (typeof s === 'string' && /^[\s\u0000-\u001F]*[=+\-@]/.test(s) ? "'" + s : s);   // מונע פרשנות כנוסחה (גם אחרי רווח/טאב)
const reply = s => ContentService.createTextOutput(s);
