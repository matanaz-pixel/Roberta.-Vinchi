// מסך המבחן: קוד אישי > 20 שאלות אחת אחת > ציון + טעויות > שליחה למייל דרך Apps Script.
// ?practice : תרגול, בלי קוד ובלי שליחה.
(function () {
  // אותו Apps Script של ספר המתכונים (apps-script/Code.gs). אחרי עדכון הקוד שם צריך "פריסה > ניהול פריסות > גרסה חדשה".
  const QUIZ_URL = 'https://script.google.com/macros/s/AKfycbyT2q5HDJJ77nzPrpd-FayB1Mq5piCG6kLpP9Kx1zq-h4dbEYZPtgNK5JYG4WXv9xSj/exec';
  const Q = window.MenuQuiz;
  const $ = s => document.querySelector(s);
  const PRACTICE = /[?&]practice\b/.test(location.search);
  const S = { menu: null, qs: [], picks: [], i: 0, code: '', result: null, version: '' };
  const show = id => ['sStart', 'sQ', 'sEnd'].forEach(x => { $('#' + x).hidden = x !== id; window.scrollTo(0, 0); });
  const txt = (el, t) => { el.textContent = t; return el; };

  if (PRACTICE) { $('#code').closest('section').querySelectorAll('label,#code').forEach(e => (e.hidden = true)); $('#practiceNote').hidden = false; }

  // המבחנים הם 10 גרסאות קבועות שהמנהל אישר (quiz-data.json). מלצר מקבל גרסה מאושרת, ובכל פעם גרסה אחרת מהקודמת.
  function loadQuiz() {
    return fetch('quiz-data.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function chooseVersion(data) {
    const want = (/[?&]v=([\w-]+)/.exec(location.search) || [])[1];
    let pool = data.versions.filter(Q.isApproved);
    if (PRACTICE) pool = want ? data.versions.filter(v => v.id === want) : (pool.length ? pool : data.versions);
    if (!pool.length) return null;
    let last = ''; try { last = localStorage.getItem('quiz_last') || ''; } catch (e) {}
    const others = pool.filter(v => v.id !== last);
    const from = others.length ? others : pool;
    return from[Math.floor(Math.random() * from.length)];
  }

  async function start() {
    const err = $('#startErr'); err.textContent = '';
    S.code = $('#code').value.trim();
    if (!PRACTICE) {
      if (!S.code) { err.textContent = 'כתוב את הקוד האישי שקיבלת.'; return; }
      $('#go').disabled = true;
      try {
        const r = await fetch(QUIZ_URL + '?a=quizcode&c=' + encodeURIComponent(S.code));
        if ((await r.text()).trim() !== 'ok') { err.textContent = 'הקוד לא מוכר. בדוק שוב או פנה למנהל.'; $('#go').disabled = false; return; }
      } catch (e) { err.textContent = 'אין חיבור לשרת. בדוק אינטרנט ונסה שוב.'; $('#go').disabled = false; return; }
    }
    let ver = null;
    try { ver = chooseVersion(await loadQuiz()); } catch (e) { err.textContent = 'לא הצלחתי לטעון את המבחן. רענן ונסה שוב.'; $('#go').disabled = false; return; }
    $('#go').disabled = false;
    if (!ver) { err.textContent = 'המבחן עדיין לא אושר על ידי המנהל. נסה מאוחר יותר.'; return; }
    try { localStorage.setItem('quiz_last', ver.id); } catch (e) {}
    S.version = ver.id; S.qs = ver.questions; S.picks = []; S.i = 0;
    show('sQ'); renderQ();
  }

  function renderQ() {
    const q = S.qs[S.i];
    txt($('#count'), 'שאלה ' + (S.i + 1) + ' מתוך ' + S.qs.length);
    $('#barFill').style.width = (S.i / S.qs.length * 100) + '%';
    txt($('#qText'), q.q);
    const box = $('#opts'); box.textContent = '';
    q.options.forEach((o, k) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'opt'; b.textContent = o;
      b.addEventListener('click', () => { S.picks[S.i] = k; [...box.children].forEach((c, j) => c.classList.toggle('on', j === k)); $('#next').disabled = false; });
      box.appendChild(b);
    });
    $('#next').disabled = S.picks[S.i] == null;
    txt($('#next'), S.i === S.qs.length - 1 ? 'סיום ובדיקה' : 'הבא');
  }

  function next() {
    if (S.picks[S.i] == null) return;
    if (S.i < S.qs.length - 1) { S.i++; renderQ(); } else finish();
  }

  function finish() {
    const r = S.result = Q.score(S.qs, S.picks);
    txt($('#pct'), r.pct + '%');
    const v = $('#verdict'); v.className = 'verdict ' + (r.pass ? 'pass' : 'fail');
    v.textContent = (r.pass ? 'עברת' : 'לא עברת') + ' (' + r.right + ' מתוך ' + r.total + ', ציון עובר ' + Q.PASS + '%)';
    const list = $('#wrongList'); list.textContent = '';
    if (r.wrong.length) {
      const h = document.createElement('p'); h.className = 'muted'; h.textContent = 'כדאי לחזור על:'; list.appendChild(h);
      r.wrong.forEach(w => {
        const d = document.createElement('div'); d.className = 'wrong';
        const b = document.createElement('b'); b.textContent = w.q;
        const a = document.createElement('div'); a.className = 'bad'; a.textContent = 'ענית: ' + w.chosen;
        const c = document.createElement('div'); c.className = 'good'; c.textContent = 'נכון: ' + w.correct;
        d.append(b, a, c); list.appendChild(d);
      });
    }
    show('sEnd'); send();
  }

  async function send() {
    const sent = $('#sent'), retry = $('#retry'); retry.hidden = true;
    if (PRACTICE) { txt(sent, 'מצב תרגול: התוצאה לא נשלחה.'); return; }
    txt(sent, 'שולח את התוצאה למנהל...');
    const r = S.result;
    let res = null;
    try {
      const resp = await fetch(QUIZ_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ a: 'quiz', code: S.code, version: S.version, right: r.right, total: r.total, wrong: r.wrong }) });
      res = (await resp.text()).trim();
    } catch (e) { res = null; }
    if (res === 'ok') txt(sent, 'התוצאה נשלחה למנהל. תודה!');
    else if (res === 'busy') txt(sent, 'נשלחו כבר מספר תוצאות היום עם הקוד הזה. פנה למנהל.');
    else { txt(sent, 'לא הצלחתי לשלוח את התוצאה. בדוק אינטרנט ולחץ "נסה לשלוח שוב". כדאי גם לצלם מסך.'); retry.hidden = false; }
  }

  $('#go').addEventListener('click', start);
  $('#code').addEventListener('keydown', e => { if (e.key === 'Enter') start(); });
  $('#next').addEventListener('click', next);
  $('#retry').addEventListener('click', send);
  $('#again').addEventListener('click', () => { $('#startErr').textContent = ''; show('sStart'); });
})();
