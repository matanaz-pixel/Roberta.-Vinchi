const test = require('node:test');
const assert = require('node:assert');
const SK = require('../stock-lib.js');

const H = 'מוצר,יחידה,ראשון,שני,שלישי,רביעי,חמישי,שישי,שבת,מתכון,הערה';
const csv = (...rows) => [H, ...rows].join('\n');
const defs = (...rows) => SK.parseDefs(csv(...rows));
const P = (name, base, extra = {}) => ({ name, unit: 'ליטר', base, recipe: '', note: '', ...extra });
const D = (n, v) => Array.from({ length: 7 }, (_, i) => (i === n ? v : null));   // בסיס רק ביום n

// ---- קבועים ----
test('constants match the spec', () => {
  assert.deepStrictEqual(SK.STATIONS, [{ key: 'cold', name: 'פס קר' }, { key: 'hot', name: 'פס חם' }, { key: 'tabun', name: 'טאבון' }]);
  assert.deepStrictEqual(SK.DAYS, ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']);
  assert.deepStrictEqual(SK.HEADERS, ['מוצר', 'יחידה', ...SK.DAYS, 'מתכון', 'הערה']);
});

// ---- זמן ----
test('dayIdx/dateKey use Israel time, not the device clock', () => {
  const d = new Date('2026-10-29T22:30:00Z');                      // 00:30 ב-30.10 בישראל (UTC+2 אחרי סוף שעון הקיץ)
  assert.strictEqual(SK.dateKey(d), '2026-10-30');
  assert.strictEqual(SK.dayIdx(d), 5);                              // שישי
  assert.strictEqual(SK.dateKey(new Date('2026-10-29T21:59:59Z')), '2026-10-29');
  assert.strictEqual(SK.dayIdx(new Date('2026-10-29T21:59:59Z')), 4);   // חמישי
});
test('dayIdx covers all 7 days (Sunday=0)', () => {
  for(let i = 0; i < 7; i++) assert.strictEqual(SK.dayIdx(new Date(Date.UTC(2026, 9, 25 + i, 10))), i);   // 25.10.2026 הוא יום ראשון
});
test('midnight boundaries around DST start (27.3.2026) and DST end (25.10.2026)', () => {
  assert.strictEqual(SK.dateKey(new Date('2026-03-26T21:59:59Z')), '2026-03-26');   // 23:59:59 (+2)
  assert.strictEqual(SK.dateKey(new Date('2026-03-26T22:00:00Z')), '2026-03-27');   // 00:00 (+2)
  assert.strictEqual(SK.dateKey(new Date('2026-03-27T00:01:00Z')), '2026-03-27');   // 03:01 (+3)
  assert.strictEqual(SK.dateKey(new Date('2026-10-24T20:59:59Z')), '2026-10-24');   // 23:59:59 (+3)
  assert.strictEqual(SK.dateKey(new Date('2026-10-24T21:00:00Z')), '2026-10-25');   // 00:00 (+3)
  assert.strictEqual(SK.dateKey(new Date('2026-10-25T21:59:59Z')), '2026-10-25');   // 23:59:59 (+2)
  assert.strictEqual(SK.dateKey(new Date('2026-10-25T22:00:00Z')), '2026-10-26');
});
test('explicit tz argument and numeric timestamps', () => {
  const t = Date.UTC(2026, 9, 29, 22, 30);
  assert.strictEqual(SK.dateKey(t), '2026-10-30');
  assert.strictEqual(SK.dateKey(t, 'UTC'), '2026-10-29');
  assert.strictEqual(SK.dayIdx(t, 'UTC'), 4);
  assert.strictEqual(SK.dateKey(t, 'Pacific/Kiritimati'), '2026-10-30');
});
test('invalid dates throw instead of returning garbage', () => {
  assert.throws(() => SK.dateKey(new Date('nope')), TypeError);
  assert.throws(() => SK.dayIdx(NaN), TypeError);
  assert.throws(() => SK.dateKey(undefined), TypeError);
});
test('addDays is calendar arithmetic (leap years, month/year ends, no DST drift)', () => {
  assert.strictEqual(SK.addDays('2026-02-28', 1), '2026-03-01');
  assert.strictEqual(SK.addDays('2028-02-28', 1), '2028-02-29');
  assert.strictEqual(SK.addDays('2028-02-28', 2), '2028-03-01');
  assert.strictEqual(SK.addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(SK.addDays('2026-01-01', -1), '2025-12-31');
  assert.strictEqual(SK.addDays('2026-03-26', 1), '2026-03-27');
  assert.strictEqual(SK.addDays('2026-10-24', 1), '2026-10-25');
  assert.strictEqual(SK.addDays('2026-10-30', 0), '2026-10-30');
  assert.strictEqual(SK.addDays('2026-10-30', -7), '2026-10-23');
  assert.strictEqual(SK.addDays('2026-10-30', 400), '2027-12-04');
});
test('addDays rejects bad input', () => {
  for(const bad of ['2026-02-30', '2026-13-01', '2026-1-1', '', null, undefined, '20261030', '2026-10-30T00:00']) assert.throws(() => SK.addDays(bad, 1), TypeError, String(bad));
  for(const n of [1.5, NaN, Infinity, '1', null]) assert.throws(() => SK.addDays('2026-10-30', n), TypeError, String(n));
});

// ---- מפתחות ----
test('sanitizeKey strips Firebase-forbidden characters and control chars', () => {
  assert.strictEqual(SK.sanitizeKey('רוטב.עגבניות'), 'רוטב_עגבניות');
  assert.strictEqual(SK.sanitizeKey('a$b#c[d]e/f'), 'a_b_c_d_e_f');
  assert.strictEqual(SK.sanitizeKey('a\u0000b\u001fc\u007fd'), 'a_b_c_d');
  assert.strictEqual(SK.sanitizeKey('  שום  '), 'שום');
  assert.strictEqual(SK.sanitizeKey(null), '');
  assert.strictEqual(SK.sanitizeKey(undefined), '');
  assert.strictEqual(SK.sanitizeKey(5), '5');
});
test('sanitizeKey truncates to 60 characters without splitting surrogate pairs', () => {
  assert.strictEqual(SK.sanitizeKey('א'.repeat(100)), 'א'.repeat(60));
  const s = SK.sanitizeKey('😀'.repeat(100));
  assert.strictEqual(Array.from(s).length, 60);
  assert.ok(!/[\ud800-\udbff]$/.test(s));
});
test('sanitizeKey neutralises __proto__', () => {
  assert.notStrictEqual(SK.sanitizeKey('__proto__'), '__proto__');
  const o = {}; o[SK.sanitizeKey('__proto__')] = 1;
  assert.strictEqual(Object.getPrototypeOf(o), Object.prototype);
});
test('sanitizeKey output is always a valid non-forbidden key', () => {
  for(const s of ['a.b', '$x', '#', '[]', '/', 'ok', 'שם עם רווח', '\n', 'a\tb', '..', '']) assert.ok(!/[.$#\[\]\/\u0000-\u001F\u007F]/.test(SK.sanitizeKey(s)), JSON.stringify(s));
});

// ---- parseDefs ----
test('parseDefs: basic parse with all columns', () => {
  const r = defs('רוטב עגבניות,ליטר,10,10,10,10,10,15,,קרם כרובית,לבשל טרי');
  assert.deepStrictEqual(r.warnings, []);
  assert.strictEqual(r.products.length, 1);
  assert.deepStrictEqual(r.products[0], { name: 'רוטב עגבניות', unit: 'ליטר', base: [10, 10, 10, 10, 10, 15, null], recipe: 'קרם כרובית', note: 'לבשל טרי' });
});
test('parseDefs: BOM, CRLF, quoted commas and newlines', () => {
  const text = '﻿' + [H, '"שום, קלוף","ק""ג","1,5",2,,,,,,,"שורה1\nשורה2"'].join('\r\n') + '\r\n';
  const r = SK.parseDefs(text);
  assert.strictEqual(r.products[0].name, 'שום, קלוף');
  assert.deepStrictEqual(r.products[0].base, [1.5, 2, null, null, null, null, null]);
  assert.strictEqual(r.products[0].note, 'שורה1\nשורה2');
});
test('parseDefs: headers are read by name, in any order, with stray spaces', () => {
  const text = 'הערה, שבת ,מוצר,שישי,חמישי,רביעי,שלישי,שני,ראשון,יחידה\nn,7,שום,6,5,4,3,2,1,"ק""ג"';
  const r = SK.parseDefs(text);
  assert.deepStrictEqual(r.products[0], { name: 'שום', unit: 'ק"ג', base: [1, 2, 3, 4, 5, 6, 7], recipe: '', note: 'n' });
});
test('parseDefs: missing required header or no rows returns null', () => {
  assert.strictEqual(SK.parseDefs('שם,יחידה,ראשון,שני,שלישי,רביעי,חמישי,שישי,שבת\nשום,"ק""ג",1,1,1,1,1,1,1'), null);        // אין "מוצר"
  assert.strictEqual(SK.parseDefs('מוצר,יחידה,ראשון,שני,שלישי,רביעי,חמישי,שישי\nשום,"ק""ג",1,1,1,1,1,1'), null);               // אין "שבת"
  assert.strictEqual(SK.parseDefs(H), null);
  assert.strictEqual(SK.parseDefs(''), null);
  assert.strictEqual(SK.parseDefs(null), null);
  assert.strictEqual(SK.parseDefs(undefined), null);
  assert.strictEqual(SK.parseDefs(H + '\n,,1,1,1,1,1,1,1,,'), null);                                                          // רק שורת שם ריק
});
test('parseDefs: optional columns may be missing', () => {
  const r = SK.parseDefs('מוצר,ראשון,שני,שלישי,רביעי,חמישי,שישי,שבת\nשום,1,2,3,4,5,6,7');
  assert.deepStrictEqual(r.products[0], { name: 'שום', unit: '', base: [1, 2, 3, 4, 5, 6, 7], recipe: '', note: '' });
});
test('parseDefs: empty and 0 base mean "not needed", decimal comma accepted', () => {
  const r = defs('שום,"ק""ג",0,,"0,5",0.25, 3 ,0.00,');
  assert.deepStrictEqual(r.products[0].base, [null, null, 0.5, 0.25, 3, null, null]);
  assert.deepStrictEqual(r.warnings, []);
});
test('parseDefs: bad numbers become null with a warning naming product and day', () => {
  const r = defs('שום,"ק""ג",abc,-1,1e3,100001,Infinity,NaN,1.234');
  assert.deepStrictEqual(r.products[0].base, [null, null, null, null, null, null, null]);
  assert.strictEqual(r.warnings.length, 7);
  assert.ok(r.warnings[0].includes('שום') && r.warnings[0].includes('ראשון'));
});
test('parseDefs: base at the 100000 limit is accepted', () => {
  assert.strictEqual(defs('שום,"ק""ג",100000').products[0].base[0], 100000);
});
test('parseDefs: duplicates (also after sanitising) are rejected with a warning, first wins', () => {
  const r = defs('שום,"ק""ג",1', 'שום,"ק""ג",9', 'א.ב,"ק""ג",2', 'א_ב,"ק""ג",3', ' שום ,"ק""ג",5');
  assert.deepStrictEqual(r.products.map(p => p.name), ['שום', 'א.ב']);
  assert.strictEqual(r.products[0].base[0], 1);
  assert.strictEqual(r.warnings.length, 3);
});
test('parseDefs: empty names skipped silently, inner whitespace collapsed, name trimmed', () => {
  const r = defs(',"ק""ג",1', '  ,"ק""ג",1', '  רוטב   עגבניות  ,ליטר,2');
  assert.deepStrictEqual(r.products.map(p => p.name), ['רוטב עגבניות']);
  assert.deepStrictEqual(r.warnings, []);
});
test('parseDefs: product named __proto__ cannot poison objects', () => {
  const r = defs('__proto__,"ק""ג",1', 'constructor,"ק""ג",1');
  const out = SK.prepList(r.products, {}, 0);
  assert.strictEqual(Object.getPrototypeOf(out), Object.prototype);
  assert.strictEqual(({}).polluted, undefined);
});
test('parseDefs: products with no base on any day are still kept (for history)', () => {
  const r = defs('שום,"ק""ג",,,,,,,');
  assert.strictEqual(r.products.length, 1);
});

// ---- baseFor / productsForDay ----
test('baseFor returns null for empty and zero, number otherwise', () => {
  const p = P('x', [1, null, 0, 2.5, undefined, -1, NaN]);
  assert.strictEqual(SK.baseFor(p, 0), 1);
  assert.strictEqual(SK.baseFor(p, 1), null);
  assert.strictEqual(SK.baseFor(p, 2), null);
  assert.strictEqual(SK.baseFor(p, 3), 2.5);
  assert.strictEqual(SK.baseFor(p, 4), null);
  assert.strictEqual(SK.baseFor(p, 5), null);
  assert.strictEqual(SK.baseFor(p, 6), null);
  assert.strictEqual(SK.baseFor(p, 7), null);
  assert.strictEqual(SK.baseFor(p, -1), null);
  assert.strictEqual(SK.baseFor(p, 1.5), null);
  assert.strictEqual(SK.baseFor(null, 0), null);
});
test('productsForDay keeps only products with a base that day, in sheet order', () => {
  const ps = [P('א', D(1, 5)), P('ב', D(2, 5)), P('ג', [3, 3, 0, 3, 3, 3, 3])];
  assert.deepStrictEqual(SK.productsForDay(ps, 1).map(p => p.name), ['א', 'ג']);
  assert.deepStrictEqual(SK.productsForDay(ps, 2).map(p => p.name), ['ב']);
});

// ---- validateCount ----
const VP = [P('רוטב', D(0, 10)), P('שום', D(0, 5)), P('בצל', D(1, 5))];
test('validateCount: accepts numbers and numeric strings, rounds to 2 decimals', () => {
  const r = SK.validateCount(VP, { רוטב: '2,5', שום: 0.1 + 0.2 }, 0);
  assert.deepStrictEqual(r, { ok: true, errors: [], clean: { רוטב: 2.5, שום: 0.3 } });
});
test('validateCount: zero is a real count; empty/undefined/null mean not counted', () => {
  const r = SK.validateCount(VP, { רוטב: 0, שום: '', בצל: 3 }, 0);
  assert.deepStrictEqual(r.clean, { רוטב: 0 });
  assert.strictEqual(r.ok, true);
  const r2 = SK.validateCount(VP, { רוטב: null, שום: undefined, '': 4 }, 0);
  assert.strictEqual(r2.ok, false);
  assert.deepStrictEqual(r2.clean, {});
  assert.ok(r2.errors.length >= 1);
});
test('validateCount: rejects NaN, Infinity, negative, over 100000, >2 decimals, junk strings', () => {
  for(const bad of [NaN, Infinity, -Infinity, -1, -0.01, 100000.01, 1e9, 1.005, '1.234', 'abc', '1,2,3', '--1', '1e3', '0x10', ' ', {}, [], true]) {
    const r = SK.validateCount(VP, { רוטב: bad, שום: 1 }, 0);
    if(bad === ' ') { assert.strictEqual(r.ok, true, 'whitespace = not counted'); continue; }
    assert.strictEqual(r.ok, false, JSON.stringify(bad));
    assert.ok(r.errors.some(e => e.includes('רוטב')), JSON.stringify(bad));
  }
});
test('validateCount: accepts the 0 and 100000 boundaries', () => {
  const r = SK.validateCount(VP, { רוטב: 100000, שום: 0 }, 0);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.clean, { רוטב: 100000, שום: 0 });
});
test('validateCount: unknown keys and products not scheduled that day are dropped, not errors', () => {
  const r = SK.validateCount(VP, { רוטב: 1, בצל: 5, חדש: 2, __proto__x: 1 }, 0);
  assert.deepStrictEqual(r.clean, { רוטב: 1 });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.errors, []);
});
test('validateCount: keys are the sanitised product names', () => {
  const ps = [P('א.ב', D(0, 5))];
  assert.deepStrictEqual(SK.validateCount(ps, { 'א_ב': 3 }, 0).clean, { 'א_ב': 3 });
  assert.deepStrictEqual(SK.validateCount(ps, { 'א.ב': 3 }, 0).clean, {});
});
test('validateCount: needs at least one counted value and an object', () => {
  assert.strictEqual(SK.validateCount(VP, {}, 0).ok, false);
  assert.strictEqual(SK.validateCount(VP, null, 0).ok, false);
  assert.strictEqual(SK.validateCount(VP, 'x', 0).ok, false);
  assert.strictEqual(SK.validateCount(VP, [1], 0).ok, false);
  assert.strictEqual(SK.validateCount([], { רוטב: 1 }, 0).ok, false);
});
test('validateCount: inherited properties are ignored', () => {
  const items = Object.create({ רוטב: 5 });
  assert.strictEqual(SK.validateCount(VP, items, 0).ok, false);
});

// ---- latestCount ----
test('latestCount picks the highest t; equal t falls back to the larger id', () => {
  const counts = { a: { t: 100, by: 'א', items: { x: 1 } }, b: { t: 300, by: 'ב', items: { x: 2 } }, c: { t: 200, by: 'ג', items: { x: 3 } } };
  assert.deepStrictEqual(SK.latestCount(counts), { id: 'b', t: 300, by: 'ב', items: { x: 2 } });
  const tie = { '-Maaa': { t: 5, by: 'א', items: {} }, '-Mbbb': { t: 5, by: 'ב', items: {} } };
  assert.strictEqual(SK.latestCount(tie).id, '-Mbbb');
  const rev = { '-Mbbb': tie['-Mbbb'], '-Maaa': tie['-Maaa'] };
  assert.strictEqual(SK.latestCount(rev).id, '-Mbbb');                       // לא תלוי בסדר המפתחות
});
test('latestCount ignores malformed entries and handles empty input', () => {
  assert.strictEqual(SK.latestCount(null), null);
  assert.strictEqual(SK.latestCount(undefined), null);
  assert.strictEqual(SK.latestCount({}), null);
  assert.strictEqual(SK.latestCount([]), null);
  assert.strictEqual(SK.latestCount('x'), null);
  const counts = { a: null, b: 5, c: { t: 'x' }, d: { t: NaN }, e: { t: Infinity }, f: { t: 10, by: 'ד', items: { x: 1 } } };
  assert.strictEqual(SK.latestCount(counts).id, 'f');
  assert.strictEqual(SK.latestCount({ a: { t: 1 } }).by, '');
  assert.deepStrictEqual(SK.latestCount({ a: { t: 1 } }).items, {});
});

// ---- prepList ----
test('prepList: need = base - have, only positive; sorted by need/base then name', () => {
  const ps = [P('א', D(0, 10)), P('ב', D(0, 10)), P('ג', D(0, 10)), P('ד', D(0, 4)), P('ה', D(0, 8))];
  const r = SK.prepList(ps, { א: 9, ב: 1, ג: 10, ד: 1, ה: 4 }, 0);
  assert.deepStrictEqual(r.prep.map(x => [x.name, x.need]), [['ב', 9], ['ד', 3], ['ה', 4], ['א', 1]]);    // 0.9, 0.75, 0.5, 0.1
  assert.deepStrictEqual(r.enough.map(x => x.name), ['ג']);
  assert.deepStrictEqual(r.uncounted, []);
});
test('prepList: ties on ratio sort by name (Hebrew collation)', () => {
  const ps = [P('ת', D(0, 10)), P('א', D(0, 10)), P('מ', D(0, 10))];
  const r = SK.prepList(ps, { ת: 5, א: 5, מ: 5 }, 0);
  assert.deepStrictEqual(r.prep.map(x => x.name), ['א', 'מ', 'ת']);
});
test('prepList: have >= base is "enough" (including more than base)', () => {
  const r = SK.prepList([P('א', D(0, 10)), P('ב', D(0, 10))], { א: 10, ב: 14.5 }, 0);
  assert.deepStrictEqual(r.prep, []);
  assert.deepStrictEqual(r.enough, [{ name: 'א', unit: 'ליטר', base: 10, have: 10 }, { name: 'ב', unit: 'ליטר', base: 10, have: 14.5 }]);
});
test('prepList: have 0 means prepare the whole base; missing means uncounted', () => {
  const r = SK.prepList([P('א', D(0, 10)), P('ב', D(0, 6))], { א: 0 }, 0);
  assert.deepStrictEqual(r.prep.map(x => [x.name, x.have, x.need]), [['א', 0, 10]]);
  assert.deepStrictEqual(r.uncounted, [{ name: 'ב', unit: 'ליטר', base: 6 }]);
});
test('prepList: floating point noise is rounded away', () => {
  const r = SK.prepList([P('א', D(0, 0.3)), P('ב', D(0, 1))], { א: 0.1, ב: 0.7 }, 0);
  assert.strictEqual(r.prep.find(x => x.name === 'א').need, 0.2);
  assert.strictEqual(r.prep.find(x => x.name === 'ב').need, 0.3);
  const r2 = SK.prepList([P('א', D(0, 0.3))], { א: 0.1 + 0.2 }, 0);
  assert.deepStrictEqual(r2.prep, []);                                       // 0.30000000000000004 הוא "בדיוק מספיק"
  assert.strictEqual(r2.enough.length, 1);
});
test('prepList: products without a base that day appear nowhere', () => {
  const r = SK.prepList([P('א', D(1, 10)), P('ב', [null, 0, 0, 0, 0, 0, 0])], { א: 1, ב: 1 }, 0);
  assert.deepStrictEqual(r, { prep: [], enough: [], uncounted: [] });
});
test('prepList: day selection changes the base', () => {
  const ps = [P('א', [10, 20, null, null, null, null, null])];
  assert.strictEqual(SK.prepList(ps, { א: 5 }, 0).prep[0].need, 5);
  assert.strictEqual(SK.prepList(ps, { א: 5 }, 1).prep[0].need, 15);
});
test('prepList: carries unit, base, have, note; recipe defaults to the product name', () => {
  const ps = [P('רוטב', D(0, 10), { unit: 'מיכל', note: 'טרי', recipe: 'רוטב עגבניות' }), P('שום', D(0, 5))];
  const r = SK.prepList(ps, { רוטב: 4, שום: 1 }, 0);
  assert.deepStrictEqual(r.prep.find(x => x.name === 'רוטב'), { name: 'רוטב', unit: 'מיכל', base: 10, have: 4, need: 6, recipe: 'רוטב עגבניות', note: 'טרי' });
  assert.strictEqual(r.prep.find(x => x.name === 'שום').recipe, 'שום');
});
test('prepList: items is looked up by sanitised key; null/garbage items = everything uncounted', () => {
  const ps = [P('א.ב', D(0, 5))];
  assert.strictEqual(SK.prepList(ps, { 'א_ב': 1 }, 0).prep.length, 1);
  assert.strictEqual(SK.prepList(ps, { 'א.ב': 1 }, 0).uncounted.length, 1);
  for(const items of [null, undefined, 'x', 5, []]) assert.strictEqual(SK.prepList(ps, items, 0).uncounted.length, 1);
});
test('prepList: ignores non-numeric, negative or non-finite stored values (treated as not counted)', () => {
  const ps = [P('א', D(0, 5)), P('ב', D(0, 5)), P('ג', D(0, 5)), P('ד', D(0, 5))];
  const r = SK.prepList(ps, { א: 'x', ב: -1, ג: NaN, ד: Infinity }, 0);
  assert.strictEqual(r.uncounted.length, 4);
});
test('prepList: inherited keys are not read', () => {
  const r = SK.prepList([P('toString', D(0, 5))], {}, 0);
  assert.strictEqual(r.uncounted.length, 1);
});

// ---- fmtQty ----
test('fmtQty drops trailing zeros and noise', () => {
  assert.strictEqual(SK.fmtQty(2), '2');
  assert.strictEqual(SK.fmtQty(1.5), '1.5');
  assert.strictEqual(SK.fmtQty(0.25), '0.25');
  assert.strictEqual(SK.fmtQty(0.1 + 0.2), '0.3');
  assert.strictEqual(SK.fmtQty(1.0), '1');
  assert.strictEqual(SK.fmtQty(100000), '100000');
  assert.strictEqual(SK.fmtQty(0), '0');
  assert.strictEqual(SK.fmtQty(-0), '0');
  assert.strictEqual(SK.fmtQty(1e-9), '0');
  assert.strictEqual(SK.fmtQty(NaN), '');
  assert.strictEqual(SK.fmtQty(Infinity), '');
  assert.strictEqual(SK.fmtQty(null), '');
  assert.strictEqual(SK.fmtQty(undefined), '');
});

// ---- WhatsApp ----
test('formatWhatsApp: Hebrew, one line per product, no emoji, Israeli date', () => {
  const text = SK.formatWhatsApp({
    station: 'פס קר', dateKey: '2026-10-30', dayName: 'שישי', by: 'דני',
    prep: [{ name: 'רוטב', unit: 'ליטר', need: 6 }, { name: 'שום', unit: '', need: 1.5 }],
    uncounted: [{ name: 'בצל' }],
  });
  assert.strictEqual(text, ['הכנות פס קר, שישי 30/10/2026', 'נספר על ידי דני', '', 'להכין:', 'רוטב: 6 ליטר', 'שום: 1.5', '', 'לא נספר: בצל'].join('\n'));
  assert.ok(!/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(text));
});
test('formatWhatsApp: nothing to prepare, no uncounted', () => {
  const text = SK.formatWhatsApp({ station: 'טאבון', dateKey: '2026-01-05', dayName: 'שני', by: 'דנה', prep: [], uncounted: [] });
  assert.strictEqual(text, ['הכנות טאבון, שני 05/01/2026', 'נספר על ידי דנה', '', 'אין מה להכין, הכול מספיק.'].join('\n'));
});
test('formatWhatsApp: sheet-supplied text cannot inject lines', () => {
  const text = SK.formatWhatsApp({ station: 'פס קר', dateKey: '2026-10-30', dayName: 'שישי', by: 'דני\nשורה', prep: [{ name: 'א\nב\r\nג', unit: 'ל\tיטר', need: 1 }], uncounted: [] });
  assert.ok(text.includes('א ב ג: 1 ל יטר'));
  assert.ok(text.includes('נספר על ידי דני שורה'));
  assert.strictEqual(text.split('\n').length, 5);
});
test('formatWhatsApp: tolerates missing optional fields', () => {
  const text = SK.formatWhatsApp({ station: 'פס חם', prep: [{ name: 'א', need: 2 }] });
  assert.ok(text.includes('א: 2'));
  assert.ok(!text.includes('undefined') && !text.includes('null') && !text.includes('NaN'));
});

// ---- ביקורת עצמית: מקרי קצה נוספים ----
const deepFreeze = o => { if(o && typeof o === 'object' && !Object.isFrozen(o)){ Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
test('functions are pure: frozen inputs are never mutated', () => {
  const ps = deepFreeze([P('א', D(0, 10)), P('ב', D(0, 4))]);
  const items = deepFreeze({ א: 3 });
  assert.doesNotThrow(() => SK.prepList(ps, items, 0));
  assert.doesNotThrow(() => SK.validateCount(ps, items, 0));
  assert.doesNotThrow(() => SK.productsForDay(ps, 0));
  assert.doesNotThrow(() => SK.latestCount(deepFreeze({ a: { t: 1, by: 'x', items: { א: 1 } } })));
  assert.doesNotThrow(() => SK.formatWhatsApp(deepFreeze({ station: 'פס קר', prep: [{ name: 'א', unit: 'ל', need: 1 }], uncounted: [] })));
});
test('names that differ only after the 60th character collide and are reported', () => {
  const long = 'א'.repeat(60);
  const r = defs(long + 'ב,ק,1'.replace(',ק,', ',"ק",'), long + 'ג,"ק",2');
  assert.strictEqual(r.products.length, 1);
  assert.strictEqual(r.warnings.length, 1);
});
test('parseDefs: duplicate header names - the first column wins', () => {
  const r = SK.parseDefs('מוצר,ראשון,שני,שלישי,רביעי,חמישי,שישי,שבת,ראשון\nשום,1,2,3,4,5,6,7,99');
  assert.strictEqual(r.products[0].base[0], 1);
});
test('parseDefs: weird header text cannot reach Object.prototype', () => {
  const r = SK.parseDefs('toString,__proto__,מוצר,ראשון,שני,שלישי,רביעי,חמישי,שישי,שבת\n1,2,שום,1,1,1,1,1,1,1');
  assert.strictEqual(r.products[0].name, 'שום');
  assert.strictEqual(({}).polluted, undefined);
});
test('parseDefs/validateCount: whitespace and shorthand decimals', () => {
  assert.deepStrictEqual(defs('שום,"ק",.5,5.,"  2,25  ",0.5,1,1,1').products[0].base, [0.5, 5, 2.25, 0.5, 1, 1, 1]);
  assert.deepStrictEqual(SK.validateCount(VP, { רוטב: ' 2 ', שום: '.5' }, 0).clean, { רוטב: 2, שום: 0.5 });
  assert.strictEqual(SK.validateCount(VP, { רוטב: '1.00000001', שום: 1 }, 0).ok, false);  // מחרוזת עם יותר משתי ספרות נדחית (רק רעש נקודה צפה של מספר מתקבל)
  assert.strictEqual(SK.validateCount(VP, { רוטב: '1.01', שום: 1 }, 0).ok, true);
  assert.strictEqual(SK.validateCount(VP, { רוטב: '1.011', שום: 1 }, 0).ok, false);
});
test('stock-lib loads recipes-lib lazily and fails clearly when it is missing', () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '../stock-lib.js'), 'utf8');
  const ctx = { self: {}, Intl, Date, Math, Object, Array, String, Number, RegExp, Set, Map, TypeError, Error, isFinite, JSON };
  vm.createContext(ctx);
  assert.doesNotThrow(() => vm.runInContext(src, ctx));                 // טעינה בלי RB לא נכשלת
  assert.throws(() => ctx.self.SK.parseDefs(csv('שום,"ק",1')), /recipes-lib/);
  ctx.self.RB = require('../recipes-lib.js');                           // RB נטען אחרי stock-lib (סדר script הפוך)
  assert.strictEqual(ctx.self.SK.parseDefs(csv('שום,"ק",1')).products.length, 1);
});
test('dayIdx/dateKey throw for an unknown time zone', () => {
  assert.throws(() => SK.dayIdx(new Date(), 'Mars/Olympus'), RangeError);
  assert.throws(() => SK.dateKey(new Date(), 'Mars/Olympus'), RangeError);
});
test('formatWhatsApp: nothing to prepare but some products uncounted does not claim "all enough"', () => {
  const t = SK.formatWhatsApp({ station: 'פס קר', dateKey: '2026-10-30', dayName: 'שישי', by: 'דני', prep: [], uncounted: [{ name: 'בצל' }, { name: 'שום' }] });
  assert.ok(!t.includes('הכול מספיק'));
  assert.ok(t.includes('אין מה להכין לפי מה שנספר.'));
  assert.ok(t.endsWith('לא נספר: בצל, שום'));
});
test('end to end: sheet CSV -> counts -> prep list for the chosen day', () => {
  const sheet = csv('רוטב עגבניות,"מיכל",10,10,10,10,10,15,,קרם כרובית,', 'שום,"ק""ג",5,5,5,5,5,5,,,', 'בצל,"ק""ג",,,,,,,8,,');
  const { products } = SK.parseDefs(sheet);
  const day = SK.dayIdx(new Date('2026-10-30T08:00:00Z'));                          // שישי
  assert.strictEqual(day, 5);
  const v = SK.validateCount(products, { 'רוטב עגבניות': '4,5', שום: 5, בצל: 3 }, day);
  assert.ok(v.ok);
  assert.deepStrictEqual(v.clean, { 'רוטב עגבניות': 4.5, שום: 5 });                  // בצל לא מתוזמן בשישי
  const out = SK.prepList(products, v.clean, day);
  assert.deepStrictEqual(out.prep.map(x => [x.name, x.need]), [['רוטב עגבניות', 10.5]]);   // בסיס שישי 15
  assert.deepStrictEqual(out.enough.map(x => x.name), ['שום']);
  assert.deepStrictEqual(out.uncounted, []);
  const wa = SK.formatWhatsApp({ station: 'פס קר', dateKey: SK.dateKey(new Date('2026-10-30T08:00:00Z')), dayName: SK.DAYS[day], by: 'דני', ...out });
  assert.ok(wa.includes('רוטב עגבניות: 10.5 מיכל'));
});

test('מפריד אלפים בפסיק נדחה ולא נקרא כ-1', () => {
  const SK2 = require('../stock-lib.js');
  const csv = 'מוצר,יחידה,ראשון,שני,שלישי,רביעי,חמישי,שישי,שבת\nא,ק"ג,"1,000",1.5,"1,5",,,,\n';
  const d = SK2.parseDefs(csv);
  assert.strictEqual(d.products[0].base[0], null);
  assert.strictEqual(d.products[0].base[1], 1.5);
  assert.strictEqual(d.products[0].base[2], 1.5);
  assert.ok(d.warnings.some(w => w.includes('1,000')));
  const r = SK2.validateCount([{ name: 'א', unit: '', base: [5, 5, 5, 5, 5, 5, 5] }], { 'א': '1,000' }, 0);
  assert.strictEqual(r.ok, false);
});
