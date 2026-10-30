// אתחול Firebase משותף לכל דפי האפליקציה
const firebaseConfig = {
  apiKey: "AIzaSyAVpa8znErN1v8eixIYlbZVy5UZVC_DEZ8",
  authDomain: "roberta-s-breaks.firebaseapp.com",
  databaseURL: "https://roberta-s-breaks-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "roberta-s-breaks",
  storageBucket: "roberta-s-breaks.firebasestorage.app",
  messagingSenderId: "26150636103",
  appId: "1:26150636103:web:3978834464b868e33dbf62"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// הגנה מפני XSS: כל ערך שמגיע מ-Firebase (שם, מזהה, תמונה) עובר דרך esc() לפני שנכנס ל-innerHTML.
function esc(v){
  return String(v == null ? '' : v).replace(/[&<>"'`]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[ch]));
}
// תמונה מותרת: data:image בלבד (בסיס 64) או כתובת https בלי תווים מסוכנים. כל השאר מוחלף בריק.
function safePhoto(p){
  if(typeof p !== 'string') return '';
  if(/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(p)) return p;
  if(/^https:\/\/[^\s"'<>()\\]+$/.test(p)) return p;
  return '';
}
