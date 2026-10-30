const test = require('node:test');
const assert = require('node:assert');
const R = require('../recipes-lib.js');

test('timers: Hebrew phrases', () => {
  const t = s => R.findTimes(s).map(x => x.sec);
  assert.deepStrictEqual(t('מבשלים 10 דקות'), [600]);
  assert.deepStrictEqual(t('כחצי דקה'), [30]);
  assert.deepStrictEqual(t('דקה וחצי'), [90]);
  assert.deepStrictEqual(t('רבע שעה'), [900]);
  assert.deepStrictEqual(t('שעה ורבע'), [4500]);
  assert.deepStrictEqual(t('שעה וחצי'), [5400]);
  assert.deepStrictEqual(t('1,5 שעות'), [5400]);
  assert.deepStrictEqual(t('2 שעות וחצי'), [9000]);
  assert.deepStrictEqual(t('שעתיים'), [7200]);
  assert.deepStrictEqual(t('שלוש דקות'), [180]);
  assert.deepStrictEqual(t('30 שניות'), [30]);
  assert.deepStrictEqual(t('בעוד שעה'), [3600]);
  assert.deepStrictEqual(t('אין זמן כאן'), []);
});
test('timers: ranges keep both ends', () => {
  const [x] = R.findTimes('אופים 40-60 דקות');
  assert.strictEqual(x.sec, 2400); assert.strictEqual(x.max, 3600);
  const [y] = R.findTimes('5-6 שעות');
  assert.strictEqual(y.sec, 18000); assert.strictEqual(y.max, 21600);
});
test('timers: no false hits inside words', () => {
  assert.deepStrictEqual(R.findTimes('מדקדקים ושעון'), []);
});

const rec = (title, ing, steps = [], cat = 'רטבים', note = '') => ({ title, cat, ingredients: ing, steps, note });
test('search: "שום" does not match שמן/שמנת', () => {
  const tokens = R.queryTokens('שום');
  assert.ok(R.searchScore(rec('שמן רוזמרין', ['1 ליטר שמן', '2 ענפים רוזמרין']), tokens) === 0);
  assert.ok(R.searchScore(rec('שמנת', ['1 ליטר שמנת']), tokens) === 0);
  assert.ok(R.searchScore(rec('מטבוחה', ['5 שיני שום']), tokens) > 0);
});
test('search: spelling, plural, finals', () => {
  assert.ok(R.searchScore(rec('עגבניות', ['3 עגבניות']), R.queryTokens('עגבניה')) > 0);
  assert.ok(R.searchScore(rec('פיצה', []), R.queryTokens('פצה')) > 0);
  assert.ok(R.searchScore(rec('לחם', ['לחם']), R.queryTokens('לחם')) > 0);
});
test('search: title outranks ingredient outranks steps', () => {
  const t = R.queryTokens('בצל');
  const a = R.searchScore(rec('קרם בצל', []), t), b = R.searchScore(rec('מרק', ['1 בצל']), t), c = R.searchScore(rec('מרק', [], ['מוסיפים בצל']), t);
  assert.ok(a > b && b > c && c > 0);
});
test('search: typo only with fuzzy', () => {
  const t = R.queryTokens('ויניגט');
  const r = rec('ויניגרט כללי', []);
  assert.strictEqual(R.searchScore(r, t), 0);
  assert.ok(R.searchScore(r, t, true) > 0);
});
test('search: all tokens required', () => {
  assert.strictEqual(R.searchScore(rec('מרק', ['בצל']), R.queryTokens('בצל גזר')), 0);
});

test('scaling: lead quantity only', () => {
  assert.strictEqual(R.scaleLine('2 ק"ג בצל', 2), '4 ק"ג בצל');
  assert.strictEqual(R.scaleLine('500 גרם סוכר', 3), '1.5 ק"ג סוכר');
  assert.strictEqual(R.scaleLine('חצי ליטר חלב', 2), '1 ליטר חלב');
});
test('scaling: flags lines with extra quantities', () => {
  assert.ok(R.hasUnscaledQty('2 ק"ג בשר, מוסיפים 300 גרם מלח'));
  assert.ok(!R.hasUnscaledQty('2 ק"ג בצל'));
});
test('scaling: step quantities are found for highlighting', () => {
  const q = R.splitQuantities('מערבבים עם 400 גרם מלח ומוסיפים 2 ליטר מים').filter(p => p.q).map(p => p.t);
  assert.deepStrictEqual(q, ['400 גרם', '2 ליטר']);
});
test('multiplier parsing', () => {
  assert.strictEqual(R.parseMultiplier('2'), 2);
  assert.strictEqual(R.parseMultiplier('1,5'), 1.5);
  assert.strictEqual(R.parseMultiplier('½'), 0.5);
  assert.strictEqual(R.parseMultiplier('0'), null);
  assert.strictEqual(R.parseMultiplier('abc'), null);
});
test('yield with portions', () => {
  assert.strictEqual(R.yieldText('מנות: 100 (270 גרם למנה)', 2), '200 מנות (270 גרם למנה)');
});

test('CSV parse + table', () => {
  const csv = 'קטגוריה,שם,מצרכים,הוראות הכנה,הערות,תפריט נוכחי\nרטבים,"רוטב, אדום","1 ק""ג עגבניות\n2 בצלים","מבשלים 10 דקות",,כן\n';
  const t = R.parseTable(csv);
  assert.strictEqual(t.length, 1);
  assert.strictEqual(t[0].title, 'רוטב, אדום');
  assert.deepStrictEqual(t[0].ingredients, ['1 ק"ג עגבניות', '2 בצלים']);
  assert.strictEqual(t[0].current, true);
});
test('table without required columns is rejected', () => {
  assert.strictEqual(R.parseTable('a,b\n1,2\n'), null);
});

test('scaling: dissolved amount in parentheses scales with the lead quantity', () => {
  assert.strictEqual(R.scaleLine("6 גרם ג'לטין (מומס ב-24 גרם מים)", 2), "12 גרם ג'לטין (מומס ב-48 גרם מים)");
});
test('scaling: per-unit weights and ratios are not flagged', () => {
  assert.ok(!R.hasUnscaledQty('2 מיכלים יוגורט כבשים (1.5 ק"ג כל אחד)'));
  assert.ok(!R.hasUnscaledQty('100 גרם אריסה לכל 2 ק"ג תבשיל מוכן'));
});
test('scaling: step quantity gets a suggested scaled value', () => {
  const q = R.splitQuantities('מערבבים עם 400 גרם מלח', 2).find(p => p.q);
  assert.strictEqual(q.s, '800 גרם');
  assert.strictEqual(R.splitQuantities('400 גרם', 1)[0].s, undefined);
});
test('yield: approximate and range portions scale', () => {
  assert.strictEqual(R.yieldText('מנות: כ-100 (270 גרם למנה)', 2), 'כ-200 מנות (270 גרם למנה)');
  assert.strictEqual(R.yieldText('מנות: 100-120', 2), '200-240 מנות');
});
test('validation of portions and yield fields', () => {
  assert.strictEqual(R.validatePortions('100 (270 גרם למנה)'), '');
  assert.strictEqual(R.validatePortions('כ-100'), '');
  assert.strictEqual(R.validatePortions('100-120'), '');
  assert.notStrictEqual(R.validatePortions('הרבה'), '');
  assert.notStrictEqual(R.validatePortions('~'), '');
  assert.strictEqual(R.validateYield('27 ק"ג בצק'), '');
  assert.notStrictEqual(R.validateYield('הרבה בצק'), '');
});

// ---- גישה למכשירים ----
test('parseAccess accepts only the known statuses', () => {
  assert.strictEqual(R.parseAccess('{"status":"ok","csv":"a"}').csv, 'a');
  for(const st of ['pending', 'blocked', 'unknown']) assert.strictEqual(R.parseAccess(JSON.stringify({ status: st })).status, st);
  for(const bad of ['ok', '', '<html>', '{"status":"admin"}', '{"x":1}', 'null', '[]']) assert.strictEqual(R.parseAccess(bad), null, bad);
});
test('cached copy is valid for 14 days only', () => {
  const t = Date.UTC(2026, 9, 29);
  assert.ok(R.cacheValid(t - 13 * 86400e3, t));
  assert.ok(!R.cacheValid(t - 15 * 86400e3, t));
  assert.ok(!R.cacheValid(undefined, t));
  assert.ok(!R.cacheValid(t + 30 * 86400e3, t));    // שעון מכשיר שזז קדימה לא מאריך תוקף
});
test('device ids are 32 hex chars and validated strictly', () => {
  const id = R.newDeviceId(Array.from({ length: 16 }, (_, i) => i * 17));
  assert.match(id, /^[a-f0-9]{32}$/);
  assert.ok(R.isDeviceId(id));
  for(const bad of ['', 'A'.repeat(32), 'a'.repeat(31), 'a'.repeat(33), null, 5]) assert.ok(!R.isDeviceId(bad));
});
