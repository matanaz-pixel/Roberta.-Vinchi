const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const crypto = require('node:crypto');

// מריץ את apps-script/Code.gs מול גיליון מדומה, כדי לבדוק את הלוגיקה בלי להתקין כלום ב-Google
class Sheet {
  constructor(rows = []){ this.rows = rows.map(r => r.slice()); this.checkboxCols = []; this.hidden = []; }
  getLastRow(){ return this.rows.length; }
  getLastColumn(){ return Math.max(0, ...this.rows.map(r => r.length)); }
  getMaxRows(){ return this.rows.length + 100; }
  appendRow(r){ this.rows.push(r.slice()); }
  getDataRange(){ return { getDisplayValues: () => this.rows.map(r => r.map(v => v instanceof Date ? v.toISOString() : String(v))) }; }
  getRange(r, c, nr = 1, nc = 1){
    const self = this;
    const cell = (i, j) => (self.rows[r - 1 + i] || [])[c - 1 + j];
    const grid = () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(i, j) ?? ''));
    return {
      getValues: grid, getValue: () => cell(0, 0) ?? '',
      setValue(v){ while(self.rows.length < r) self.rows.push([]); self.rows[r - 1][c - 1] = v; return this; },
      insertCheckboxes(){ self.checkboxCols.push(c); return this; }, setFontWeight(){ return this; }, setDataValidation(){ return this; },
    };
  }
  setFrozenRows(){} setColumnWidths(){} hideColumns(c){ this.hidden.push(c); }
}

function makeEnv(){
  const cache = {}, mails = [];
  const sheets = {
    'recipes': new Sheet([['קטגוריה', 'שם', 'מצרכים', 'הוראות הכנה', 'הערות'], ['פס קר', 'סחוג', '1 ק"ג עגבניות', 'מבשלים,\nומערבבים', 'תפוקה: 3 ליטר']]),
  };
  const ctx = {
    SpreadsheetApp: { newDataValidation: () => { const b = { requireValueInList: () => b, setAllowInvalid: () => b, build: () => ({}) }; return b; }, getActive: () => ({
      getSheetByName: n => sheets[n] || null, getUrl: () => 'u', getSheets: () => Object.values(sheets),
      insertSheet: n => (sheets[n] = new Sheet()),
    }) },
    LockService: { getScriptLock: () => ({ waitLock(){}, releaseLock(){} }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
    ContentService: { createTextOutput: s => s }, MailApp: { sendEmail: (...a) => mails.push(a) }, Session: { getEffectiveUser: () => ({ getEmail: () => 'x' }) },
    Utilities: {
      computeDigest: (alg, s) => crypto.createHash(alg === 'MD5' ? 'md5' : 'sha256').update(String(s)).digest(),
      DigestAlgorithm: { MD5: 'MD5', SHA_256: 'SHA_256' }, base64EncodeWebSafe: b => Buffer.from(b).toString('base64url'),
    },
    Date, Math, JSON, String, Number, Object, Array, RegExp, Boolean,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), ctx);
  const post = body => ctx.doPost({ postData: { contents: JSON.stringify(body) } });
  const get = params => ctx.doGet({ parameter: params });
  const j = s => JSON.parse(s);
  const devices = () => sheets['מכשירים'];
  const approveAll = () => devices().rows.slice(1).forEach(r => { r[3] = true; });
  return { post, get, j, sheets, cache, mails, devices, approveAll, requests: () => sheets['בקשות תיקון'] };
}
const ID = 'a'.repeat(32), ID2 = 'b'.repeat(32);
const base = { cat: 'פס קר', title: 'סחוג', field: 'מצרכים', proposed: '2 ק"ג עגבניות', sender: 'דני', dev: ID };
// מכשיר מאושר, מוכן לשליחת תיקונים
function approved(){
  const env = makeEnv();
  env.post({ a: 'request', dev: ID, name: 'דני' });
  env.approveAll();
  return env;
}

// ---- בקשות תיקון ----
test('accepts a valid request from an approved device and records server-side current as base', () => {
  const env = approved();
  assert.strictEqual(env.post({ ...base, base: 'נוסח מזויף' }), 'ok');
  const rows = env.requests().rows;
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[1][4], '1 ק"ג עגבניות');
  assert.match(rows[1][7], /הגיליון השתנה/);
});
test('correction from unapproved or unknown device is denied and writes nothing', () => {
  const env = makeEnv();
  assert.strictEqual(env.post(base), 'denied');                          // מכשיר לא מוכר
  env.post({ a: 'request', dev: ID, name: 'דני' });
  assert.strictEqual(env.post(base), 'denied');                          // ממתין
  assert.strictEqual(env.requests(), undefined);
});
test('sender is required', () => {
  const env = approved();
  assert.strictEqual(env.post({ ...base, sender: '  ' }), 'invalid');
});
test('per-sender limit does not lock out other senders', () => {
  const env = approved();
  let busy = 0;
  for(let i = 0; i < 15; i++) if(env.post({ ...base, proposed: 'p' + i, sender: 'spammer' }) === 'busy') busy++;
  assert.ok(busy >= 5);
  assert.strictEqual(env.post({ ...base, proposed: 'שונה לגמרי', sender: 'דנה' }), 'ok');
});
test('limit window is fixed, key includes the window number', () => {
  const env = approved();
  env.post(base);
  assert.ok(Object.keys(env.cache).some(k => /^rs-\d+-/.test(k)));
});
test('formulas and hidden control chars are neutralised', () => {
  const env = approved();
  env.post({ ...base, proposed: '=HYPERLINK("http://x")', sender: '\t=cmd' });
  const row = env.requests().rows[1];
  assert.ok(String(row[5]).startsWith("'"));
  assert.ok(String(row[8]).startsWith("'"));
});
test('unknown recipe is rejected', () => {
  const env = approved();
  assert.strictEqual(env.post({ ...base, title: 'לא קיים' }), 'unknown');
});

// ---- אישור מכשירים ----
test('new device: unknown until it asks, then pending, and no data is leaked', () => {
  const env = makeEnv();
  assert.deepStrictEqual(env.j(env.get({ a: 'data', d: ID })), { status: 'unknown' });
  const r = env.j(env.post({ a: 'request', dev: ID, name: 'דני' }));
  assert.strictEqual(r.status, 'pending');
  assert.match(r.code, /^[0-9A-F]{4}$/);
  const g = env.j(env.get({ a: 'data', d: ID }));
  assert.strictEqual(g.status, 'pending');
  assert.strictEqual(g.csv, undefined);
});
test('request is stored with a hash of the id, never the id itself, and a checkbox column', () => {
  const env = makeEnv();
  env.post({ a: 'request', dev: ID, name: 'דני' });
  const rows = env.devices().rows;
  assert.strictEqual(rows.length, 2);
  assert.ok(!JSON.stringify(rows).includes(ID));
  assert.strictEqual(rows[1][1], 'דני');
  assert.strictEqual(rows[1][3], false);
  assert.deepStrictEqual(env.devices().checkboxCols, [4]);
  assert.deepStrictEqual(env.devices().hidden, [6]);
});
test('approving a device (checkbox) opens the book, and it returns recipes as CSV', () => {
  const env = makeEnv();
  env.post({ a: 'request', dev: ID, name: 'דני' });
  env.devices().rows[1][3] = true;
  const g = env.j(env.get({ a: 'data', d: ID }));
  assert.strictEqual(g.status, 'ok');
  assert.match(g.csv, /^קטגוריה,שם,מצרכים,הוראות הכנה,הערות\n/);
  assert.ok(g.csv.includes('"מבשלים,\nומערבבים"'));                          // ציטוט נכון של פסיק ושורה חדשה
  assert.strictEqual(g.extra, '');                                          // אין טאב recipes-extra
});
test('recipes-extra tab is served only to approved devices', () => {
  const env = makeEnv();
  env.sheets['recipes-extra'] = new Sheet([['קטגוריה', 'שם'], ['קונדיטוריה', 'עוגה']]);
  env.post({ a: 'request', dev: ID, name: 'דני' });
  assert.strictEqual(env.j(env.get({ a: 'data', d: ID })).extra, undefined);
  env.approveAll();
  assert.match(env.j(env.get({ a: 'data', d: ID })).extra, /עוגה/);
});
test('unchecking the box blocks the device after it has been seen', () => {
  const env = approved();
  env.get({ a: 'data', d: ID });                                            // נראה לראשונה
  env.devices().rows[1][3] = false;
  const g = env.j(env.get({ a: 'data', d: ID }));
  assert.strictEqual(g.status, 'blocked');
  assert.strictEqual(g.csv, undefined);
  assert.strictEqual(env.post({ ...base }), 'denied');                      // וגם לא יכול לשלוח תיקונים
});
test('asking again does not create duplicate rows, and an other device is separate', () => {
  const env = makeEnv();
  env.post({ a: 'request', dev: ID, name: 'דני' });
  env.post({ a: 'request', dev: ID, name: 'דני שוב' });
  assert.strictEqual(env.devices().rows.length, 2);
  env.post({ a: 'request', dev: ID2, name: 'דנה' });
  assert.strictEqual(env.devices().rows.length, 3);
  assert.strictEqual(env.j(env.get({ a: 'data', d: ID2 })).status, 'pending');
});
test('malformed ids and empty names are rejected', () => {
  const env = makeEnv();
  assert.strictEqual(env.post({ a: 'request', dev: 'short', name: 'דני' }), 'invalid');
  assert.strictEqual(env.post({ a: 'request', dev: ID, name: '   ' }), 'invalid');
  assert.strictEqual(env.post({ a: 'request', dev: ID.toUpperCase(), name: 'דני' }), 'invalid');
  assert.strictEqual(env.devices(), undefined);
  assert.deepStrictEqual(env.j(env.get({ a: 'data', d: "' OR 1" })), { status: 'unknown' });
});
test('device requests are rate limited globally and capped when too many are pending', () => {
  const env = makeEnv();
  const hex = i => i.toString(16).padStart(32, '0');
  let busy = 0;
  for(let i = 1; i <= 30; i++) if(env.post({ a: 'request', dev: hex(i), name: 'x' + i }) === 'busy') busy++;
  assert.strictEqual(busy, 10);                                              // 20 בחלון
  assert.strictEqual(env.devices().rows.length, 21);
});
test('device names cannot become formulas', () => {
  const env = makeEnv();
  env.post({ a: 'request', dev: ID, name: '=IMPORTXML("http://x")' });
  assert.ok(String(env.devices().rows[1][1]).startsWith("'"));
});
test('owner gets one e-mail per hour for new device requests', () => {
  const env = makeEnv();
  env.post({ a: 'request', dev: ID, name: 'דני' });
  env.post({ a: 'request', dev: ID2, name: 'דנה' });
  assert.strictEqual(env.mails.length, 1);
  assert.match(env.mails[0][2], /דני/);
});
test('honeypot field silently ignores a device request', () => {
  const env = makeEnv();
  assert.strictEqual(env.post({ a: 'request', dev: ID, name: 'בוט', website: 'http://spam' }), 'ok');
  assert.strictEqual(env.devices(), undefined);
});
