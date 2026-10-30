# ספר המתכונים של רוברטה וינצ'י

אתר סטטי (GitHub Pages). המתכונים עצמם **לא** בריפו: הם בטאב `recipes` בגיליון Google, והאתר מקבל אותם דרך Apps Script רק במכשיר שאושר.

## קבצים
- `recipes.html`, `recipes-lib.js`, `recipes-sw.js`, `recipes.webmanifest`: ספר המתכונים.
- `apps-script/Code.gs`: הקוד שרץ בגיליון. אישור מכשירים, בקשות תיקון והגשת הנתונים.
- `index.html`, `bank.html`, `history.html`, `chef.html`, `firebase-init.js`, `sw.js`, `manifest.json`: אפליקציית ההפסקות (Firebase).
- `database.rules.json`: כללי Firebase להדבקה בקונסולה (לבדוק קודם ב-Rules Playground).
- `tests/`: בדיקות. `npm run check`.

## פריסה
1. Pages: Settings > Pages > Deploy from a branch > `main` / root.
2. בגיליון: הרחבות > Apps Script, להדביק את `apps-script/Code.gs`, ולפרסם אפליקציית אינטרנט (ביצוע בתור: אני, גישה: כל אחד).
3. אחרי כל שינוי ב-`Code.gs`: פריסה > ניהול פריסות > עריכה > גרסה חדשה.
4. שיתוף הגיליון: מוגבל. לעולם לא עריכה ציבורית.

## אישור טבח
הטבח פותח את הספר, כותב שם ולוחץ "בקש גישה". בטאב `מכשירים` מסמנים וי בעמודת "מאושר". הסרת הוי חוסמת.

## בדיקת נתונים
`node tests/lint-csv.js recipes.csv [recipes-extra.csv]` על ייצוא CSV של הטאבים.

## כללי Firebase
`database.rules.json` הוא מה שפורסם בפועל: הצמתים `bank`, `breaks`, `history` פתוחים כמו קודם (כדי לא לשבור את אפליקציית ההפסקות), והצומת `stock` מוגבל (כתיבה חד-פעמית, תאריך, פס, ערכים). `docs/rules-strict-draft.json` היא טיוטה מחמירה גם לצמתים הישנים. לא נבדקה מול האפליקציה ולא פורסמה. לפני פרסום יש לבדק ב-Rules Playground מול כל פעולה של אפליקציית ההפסקות. הערה: ב-Firebase אין `numChildren()`.
