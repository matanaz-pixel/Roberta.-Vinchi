const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const L = require('../menu/menu-lib.js');

const seed = JSON.parse(fs.readFileSync(__dirname + '/../menu/menu-data.json', 'utf8'));
const item = (o) => Object.assign({ id: 'x', cat: 'a', name: 'n', price: 1, desc: '', gluten: 'unknown', lactose: 'unknown', vegan: false, allergens: [], notes: [], pregnancy: [], order: 1, visible: true }, o);

test('נתוני ההתחלה תקינים: כל מנה עם שם, מחיר, קטגוריה קיימת ותמונה שקיימת בדיסק', () => {
  const cats = new Set(seed.categories.map(c => c.id));
  const ids = new Set();
  assert.ok(seed.items.length >= 40);
  for (const it of seed.items) {
    assert.deepStrictEqual(L.validateItem(it), [], it.name);
    assert.ok(cats.has(it.cat), 'קטגוריה לא קיימת: ' + it.name);
    assert.ok(!ids.has(it.id), 'id כפול ' + it.id);
    ids.add(it.id);
    if (it.image) assert.ok(fs.existsSync(__dirname + '/../menu/' + it.image), 'חסרה תמונה ' + it.image);
  }
});

test('נתוני ההתחלה: אין שאריות XML או תווי בקרה בטקסטים', () => {
  const bad = /<\/?w:|xml:space|\[IMG/;
  for (const it of seed.items) {
    for (const v of [it.name, it.desc, it.mods, it.glutenNote, it.lactoseNote].concat(it.notes, it.pregnancy)) {
      assert.ok(!bad.test(v || ''), it.name + ': ' + v);
    }
  }
});

test('נתוני ההתחלה: לכל מנה בקובץ יש סימון גלוטן ולקטוז, חוץ מצלחת חריפים', () => {
  const missing = seed.items.filter(i => i.gluten === 'unknown' || i.lactose === 'unknown').map(i => i.name);
  assert.deepStrictEqual(missing, ['צלחת חריפים']);
});

test('normalizeMenu ממיין מערכים (וגם אובייקטים) לפי order', () => {
  const m = L.normalizeMenu({
    categories: { b: { id: 'b', name: 'ב', order: 2 }, a: { id: 'a', name: 'א', order: 1 } },
    items: { d1: item({ id: 'd1', order: 2 }), d2: item({ id: 'd2', order: 1 }) }
  });
  assert.deepStrictEqual(m.categories.map(c => c.id), ['a', 'b']);
  assert.deepStrictEqual(m.items.map(i => i.id), ['d2', 'd1']);
});

test('normalizeMenu עם נתון ריק לא נופל', () => {
  assert.deepStrictEqual(L.normalizeMenu(null), { categories: [], items: [] });
});

test('status: גלוטן ולקטוז לפי הסימון, אופציה כשיש הערה, אלרגנים אחרים לפי הרשימה', () => {
  assert.strictEqual(L.status(item({ gluten: 'no' }), 'gluten'), 'free');
  assert.strictEqual(L.status(item({ gluten: 'yes' }), 'gluten'), 'has');
  assert.strictEqual(L.status(item({ gluten: 'yes', glutenNote: 'אופציה ללא גלוטן ללא הפוקאצ\'ינה' }), 'gluten'), 'option');
  assert.strictEqual(L.status(item({ lactose: 'yes', mods: 'ללא לקטוז ללא הגבינה' }), 'lactose'), 'option');
  assert.strictEqual(L.status(item({}), 'gluten'), 'unknown');
  assert.strictEqual(L.status(item({ allergens: ['nuts'] }), 'nuts'), 'has');
  assert.strictEqual(L.status(item({}), 'nuts'), 'free');
});

test('filterItems: קטגוריה, חיפוש, הסתרה וסינון אלרגנים', () => {
  const items = [
    item({ id: '1', cat: 'a', name: 'פיצה', gluten: 'yes' }),
    item({ id: '2', cat: 'a', name: 'סלט', gluten: 'no', vegan: true }),
    item({ id: '3', cat: 'b', name: 'פסטה', gluten: 'yes', glutenNote: 'אופציה ללא גלוטן' }),
    item({ id: '4', cat: 'b', name: 'סודי', visible: false })
  ];
  assert.deepStrictEqual(L.filterItems(items, {}).map(i => i.id), ['1', '2', '3']);
  assert.deepStrictEqual(L.filterItems(items, { cat: 'b' }).map(i => i.id), ['3']);
  assert.deepStrictEqual(L.filterItems(items, { q: 'סל' }).map(i => i.id), ['2']);
  assert.deepStrictEqual(L.filterItems(items, { avoid: ['gluten'] }).map(i => i.id), ['2', '3']);
  assert.deepStrictEqual(L.filterItems(items, { vegan: true }).map(i => i.id), ['2']);
  assert.strictEqual(L.filterItems(items, { includeHidden: true }).length, 4);
});

test('filterItems: מנה שלא סומנה לגלוטן/לקטוז לא מוצגת בסינון אלרגנים (בטיחות)', () => {
  const items = [item({ id: '1', gluten: 'no', lactose: 'no' }), item({ id: '2', gluten: 'unknown', lactose: 'no' })];
  assert.deepStrictEqual(L.filterItems(items, { avoid: ['gluten'] }).map(i => i.id), ['1']);
  assert.deepStrictEqual(L.filterItems(items, {}).map(i => i.id), ['1', '2']);
});

test('moveItem: הזזה בתוך קטגוריה בלבד ושמירה על רצף', () => {
  const items = [item({ id: '1', order: 1 }), item({ id: '2', order: 2 }), item({ id: '3', order: 3 }), item({ id: 'z', cat: 'b', order: 1 })];
  const r = L.moveItem(items, '3', -1);
  const a = r.filter(i => i.cat === 'a').sort((x, y) => x.order - y.order).map(i => i.id);
  assert.deepStrictEqual(a, ['1', '3', '2']);
  assert.strictEqual(r.find(i => i.id === 'z').order, 1);
  assert.strictEqual(L.moveItem(items, '1', -1).find(i => i.id === '1').order, 1);
});

test('moveCategory ו-nextId', () => {
  const cats = [{ id: 'a', order: 1 }, { id: 'b', order: 2 }];
  assert.deepStrictEqual(L.moveCategory(cats, 'b', -1).map(c => c.id), ['b', 'a']);
  assert.strictEqual(L.nextId([{ id: 'd09' }, { id: 'd10' }]), 'd11');
  assert.strictEqual(L.nextId([]), 'd01');
});

test('validateItem', () => {
  assert.strictEqual(L.validateItem(item({ name: '  ' })).length, 1);
  assert.strictEqual(L.validateItem(item({ price: 'abc' })).length, 1);
  assert.strictEqual(L.validateItem(item({ price: -3 })).length, 1);
  assert.strictEqual(L.validateItem(item({ price: '' })).length, 1);
  assert.deepStrictEqual(L.validateItem(item({})), []);
});

test('toExport: מערכים ממוינים, סדר קטגוריות רציף, ונקרא חזרה ללא שינוי', () => {
  const cats = [{ id: 'b', name: 'ב', order: 5 }, { id: 'a', name: 'א', short: 'א׳', order: 2 }];
  const items = [item({ id: 'd2', order: 2 }), item({ id: 'd1', order: 1, image: 'data:image/webp;base64,AAAA' })];
  const out = L.toExport(cats, items);
  assert.deepStrictEqual(out.categories.map(c => [c.id, c.order, c.short]), [['a', 1, 'א׳'], ['b', 2, 'ב']]);
  assert.deepStrictEqual(out.items.map(i => i.id), ['d1', 'd2']);
  const back = L.normalizeMenu(JSON.parse(JSON.stringify(out)));
  assert.deepStrictEqual(back.items.map(i => i.id), ['d1', 'd2']);
  assert.strictEqual(back.items[0].image, 'data:image/webp;base64,AAAA');
});

test('הקובץ שיוצא מדף העריכה מהנתונים ההתחלתיים זהה בתוכן לנתונים ההתחלתיים', () => {
  const m = L.normalizeMenu(seed);
  const out = L.toExport(m.categories, m.items);
  assert.strictEqual(out.items.length, seed.items.length);
  assert.deepStrictEqual(out.items.map(i => i.name), seed.items.map(i => i.name));
});
