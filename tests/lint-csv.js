// בדיקת תקינות לייצוא של טאב המתכונים. הנתונים לא נמצאים בריפו, ולכן מריצים ידנית:
//   node tests/lint-csv.js recipes.csv [recipes-extra.csv]   (קבצי CSV שיוצאו מהגיליון)
// בדיקת תקינות לקבצי המתכונים. נכשל על שגיאות מבנה, ומדפיס אזהרות תוכן (לא מכשיל).
const fs = require('fs');
const path = require('path');
const R = require('../recipes-lib.js');
const root = path.join(__dirname, '..');
const errors = [], warns = [];
function load(file){
  const text = fs.readFileSync(path.resolve(file), 'utf8');
  const t = R.parseTable(text);
  if(!t){ errors.push(file + ': חסרות עמודות חובה (' + R.REQUIRED.map(k => R.COLUMNS[k]).join(', ') + ') או שאין שורות'); return []; }
  return t;
}
const files = process.argv.slice(2).filter(a => !a.startsWith('--'));
if(!files.length){ console.log('לא ניתנו קבצי CSV. שימוש: node tests/lint-csv.js recipes.csv [recipes-extra.csv]'); process.exit(0); }
const main = load(files[0]), extra = files[1] ? load(files[1]) : [];
const key = r => r.cat + '|' + r.title;
function check(file, list){
  const seen = new Set();
  for(const r of list){
    const k = key(r);
    if(!r.cat) errors.push(`${file}: "${r.title}" בלי קטגוריה`);
    if(r.title.includes('|')) errors.push(`${file}: "${r.title}" מכיל | (מפתח המתכון נשבר)`);
    if(seen.has(k)) errors.push(`${file}: כפילות ${k}`);
    seen.add(k);
    if(!r.ingredients.length) errors.push(`${file}: ${k} בלי מצרכים`);
    if(!r.steps.length) warns.push(`${file}: ${k} בלי הוראות הכנה`);
    if(!/^(תפוקה|מנות):/m.test(r.note)) warns.push(`${file}: ${k} בלי שורת תפוקה`);
    if(r.allergens === null) warns.push(`${file}: ${k} בלי אלרגנים`);
    if(!/חיי מדף/.test(r.note)) warns.push(`${file}: ${k} בלי חיי מדף`);
    r.ingredients.forEach(l => { if(!l.endsWith(':') && !/\d|חצי|רבע|שליש/.test(l)) warns.push(`${file}: ${k}: מצרך בלי כמות: ${l}`); });
    for(const v of r.variants || []) if(!v.ingredients.length) errors.push(`${file}: ${k}: גרסה ריקה ${v.label}`);
  }
}
check(files[0], main); if(files[1]) check(files[1], extra);
const titles = {}; main.forEach(r => (titles[r.title] ||= []).push(r.cat));
for(const [t, cats] of Object.entries(titles)) if(cats.length > 1) warns.push(`שם כפול בין קטגוריות: ${t} (${cats.join(', ')})`);
console.log(`מתכונים: ${main.length} (+${extra.length} ב-extra)`);
const grouped = {};
warns.forEach(w => { const k = w.replace(/^[^:]+: .*?: ?/, '').includes('בלי') ? w.match(/בלי [^:]+|שם כפול|מצרך בלי כמות/)?.[0] : 'אחר'; grouped[k] = (grouped[k] || 0) + 1; });
console.log('אזהרות תוכן:', grouped);
if(process.argv.includes('--verbose')) warns.forEach(w => console.log('  אזהרה:', w));
if(errors.length){ errors.forEach(e => console.error('שגיאה:', e)); process.exit(1); }
console.log('בדיקת CSV עברה.');
