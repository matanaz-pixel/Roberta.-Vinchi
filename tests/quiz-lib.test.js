'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Q = require('../menu/quiz-lib.js');
const L = require('../menu/menu-lib.js');
const menu = require('../menu/menu-data.json');

test('מבחן: נבנים 20 שאלות עם 4 תשובות שונות ותשובה נכונה אחת תקינה', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const qs = Q.generate(menu, { seed });
    assert.strictEqual(qs.length, Q.COUNT, 'seed ' + seed);
    qs.forEach(q => {
      assert.ok(q.options.length >= 2 && q.options.length <= 4);
      assert.strictEqual(new Set(q.options).size, q.options.length);
      assert.ok(q.answer >= 0 && q.answer < q.options.length);
    });
  }
});

test('מבחן: אותו seed נותן אותו מבחן, ו-seed אחר נותן מבחן אחר', () => {
  const a = JSON.stringify(Q.generate(menu, { seed: 5 })), b = JSON.stringify(Q.generate(menu, { seed: 5 })), c = JSON.stringify(Q.generate(menu, { seed: 6 }));
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
});

test('מבחן: חלק השאלות הקשות ברמה 70 הוא בערך שני שליש', () => {
  let hard = 0, total = 0;
  for (let seed = 1; seed <= 100; seed++) Q.generate(menu, { seed }).forEach(q => { total++; if (q.hard) hard++; });
  const share = hard / total;
  assert.ok(share > 0.55 && share < 0.78, 'share ' + share);
});

test('מבחן: תשובות נכונות מתאימות לנתוני התפריט (גלוטן, טבעוני)', () => {
  const m = L.normalizeMenu(menu);
  const byName = n => m.items.find(i => i.name === n);
  for (let seed = 1; seed <= 100; seed++) {
    Q.generate(menu, { seed }).forEach(q => {
      const ans = q.options[q.answer];
      if (q.kind === 'vegan') assert.ok(byName(ans).vegan);
      if (q.kind === 'gluten') assert.strictEqual(L.status(byName(ans), 'gluten'), 'free');
      if (q.kind === 'lactose') assert.strictEqual(L.status(byName(ans), 'lactose'), 'has');
      if (q.kind === 'option_gluten') assert.strictEqual(L.status(byName(ans), 'gluten'), 'option');
    });
  }
});

test('מבחן: מנה מוסתרת או בלי מחיר לא נכנסת למבחן', () => {
  const m = JSON.parse(JSON.stringify(menu));
  m.items[0].visible = false;
  const hidden = m.items[0].name;
  for (let seed = 1; seed <= 50; seed++) Q.generate(m, { seed }).forEach(q => {
    assert.ok(!q.options.includes(hidden) && q.q.indexOf('"' + hidden + '"') < 0);
  });
});

test('ציון: חישוב אחוז, עובר/נכשל ורשימת טעויות', () => {
  const qs = Q.generate(menu, { seed: 9 });
  const all = Q.score(qs, qs.map(q => q.answer));
  assert.strictEqual(all.pct, 100); assert.ok(all.pass); assert.strictEqual(all.wrong.length, 0);
  const none = Q.score(qs, qs.map(() => null));
  assert.strictEqual(none.pct, 0); assert.ok(!none.pass); assert.strictEqual(none.wrong.length, qs.length);
  assert.strictEqual(none.wrong[0].chosen, '(לא נענתה)');
});

test('גרסאות: 10 גרסאות קבועות, כל אחת 20 שאלות, לא מאושרות בהתחלה', () => {
  const d = Q.buildVersions(menu);
  assert.strictEqual(d.versions.length, 10);
  d.versions.forEach(v => { assert.strictEqual(v.questions.length, 20); assert.ok(!Q.isApproved(v)); });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(d)), JSON.parse(JSON.stringify(Q.buildVersions(menu))));   // דטרמיניסטי
  const sets = d.versions.map(v => v.questions.map(q => q.q + q.options[q.answer]).join('|'));
  assert.strictEqual(new Set(sets).size, 10);
});

test('גרסאות: אישור גרסה רק כשכל השאלות מאושרות', () => {
  const v = Q.buildVersions(menu).versions[0];
  v.questions.forEach(q => { q.ok = true; });
  assert.ok(Q.isApproved(v));
  v.questions[3].ok = false;
  assert.ok(!Q.isApproved(v));
});

test('גרסאות: החלפת שאלה נותנת שאלה אחרת, לא כפולה, באותה רמה ולא מאושרת', () => {
  const v = Q.buildVersions(menu).versions[2];
  for (let i = 0; i < v.questions.length; i++) {
    const nv = Q.replaceQuestion(menu, v, i, 3);
    assert.notStrictEqual(nv.questions[i].q + nv.questions[i].options[nv.questions[i].answer], v.questions[i].q + v.questions[i].options[v.questions[i].answer]);
    assert.strictEqual(nv.questions[i].hard, v.questions[i].hard);
    assert.strictEqual(nv.questions[i].ok, false);
    assert.strictEqual(new Set(nv.questions.map(q => q.q + '|' + q.options[q.answer])).size, nv.questions.length);
    assert.strictEqual(v.questions[i].ok, false);   // המקור לא נפגע
  }
});

test('גרסאות: שינוי סימון גלוטן בתפריט משנה את טביעת האצבע, מנה מוסתרת גם', () => {
  const h = Q.menuHash(menu);
  const m2 = JSON.parse(JSON.stringify(menu)); m2.items[0].gluten = m2.items[0].gluten === 'yes' ? 'no' : 'yes';
  assert.notStrictEqual(Q.menuHash(m2), h);
  const m3 = JSON.parse(JSON.stringify(menu)); m3.items[0].visible = false;
  assert.notStrictEqual(Q.menuHash(m3), h);
  assert.strictEqual(Q.menuHash(JSON.parse(JSON.stringify(menu))), h);
});

test('גרסאות: טביעת האצבע לא תלויה בסדר המנות בקובץ', () => {
  const m2 = JSON.parse(JSON.stringify(menu)); m2.items.reverse();
  assert.strictEqual(Q.menuHash(m2), Q.menuHash(menu));
});

test('מבחן: אין שאלות על מחיר', () => {
  for (let seed = 1; seed <= 200; seed++) Q.generate(menu, { seed }).forEach(q => {
    assert.ok(!/₪|כמה עולה|יקרה|מחיר/.test(q.q + q.options.join(' ')), q.q);
  });
  Q.buildVersions(menu).versions.forEach(v => v.questions.forEach(q => assert.ok(!/₪|כמה עולה|יקרה|מחיר/.test(q.q + q.options.join(' ')))));
});

test('מבחן: שינוי מחיר בלבד לא משנה את טביעת האצבע (המבחן לא תלוי במחיר)', () => {
  const m2 = JSON.parse(JSON.stringify(menu)); m2.items[0].price = Number(m2.items[0].price) + 5;
  assert.strictEqual(Q.menuHash(m2), Q.menuHash(menu));
});
