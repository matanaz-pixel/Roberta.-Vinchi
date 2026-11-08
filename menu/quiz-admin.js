// אישור מבחנים: 10 גרסאות קבועות. המנהל מאשר כל שאלה או מחליף אותה, ומוריד quiz-data.json.
// טיוטה נשמרת בדפדפן (quiz_draft_v1). רק גרסה שכל שאלותיה מאושרות מוצגת למלצרים.
(function () {
  const Q = window.MenuQuiz;
  const $ = s => document.querySelector(s);
  const DRAFT = 'quiz_draft_v1';
  const S = { menu: null, data: null, open: null, draft: false };
  const txt = (el, t) => { el.textContent = t; return el; };
  const el = (tag, cls, t) => { const e = document.createElement(tag); if (cls) e.className = cls; if (t != null) e.textContent = t; return e; };
  function toast(t) { const x = $('#toast'); x.textContent = t; x.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => x.classList.remove('show'), 3500); }

  function save() {
    try { localStorage.setItem(DRAFT, JSON.stringify(S.data)); S.draft = true; $('#draftNote').hidden = false; } catch (e) {}
  }

  async function load() {
    S.menu = await fetch('menu-data.json', { cache: 'no-cache' }).then(r => r.json());
    let d = null;
    try { d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch (e) {}
    if (d && d.versions) { S.data = d; S.draft = true; $('#draftNote').hidden = false; }
    else {
      try { const r = await fetch('quiz-data.json', { cache: 'no-cache' }); if (!r.ok) throw 0; S.data = await r.json(); }
      catch (e) { S.data = Q.buildVersions(S.menu); }
    }
    render();
  }

  function render() {
    const stale = S.data.menuHash !== Q.menuHash(S.menu);
    const w = $('#warn'); w.hidden = !stale;
    if (stale) w.textContent = 'התפריט השתנה מאז שנבנו הגרסאות. שאלות שנשענות על מנה שהשתנתה (מחיר, אלרגן, שינויים) עלולות להיות לא נכונות. מומלץ ללחוץ "בנה את כל הגרסאות מחדש" ולאשר שוב.';
    const approved = S.data.versions.filter(Q.isApproved).length;
    txt($('#summary'), approved + ' מתוך ' + S.data.versions.length + ' גרסאות מאושרות.');
    const list = $('#list'); list.textContent = '';
    S.data.versions.forEach((v, vi) => {
      const ok = Q.isApproved(v), cnt = v.questions.filter(q => q.ok).length;
      const d = el('details', 'ver'); d.open = S.open === vi;
      d.addEventListener('toggle', () => { if (d.open) S.open = vi; else if (S.open === vi) S.open = null; });
      const sum = el('summary');
      sum.append(el('span', 'vtitle', 'גרסה ' + (vi + 1)), el('span', 'chip' + (ok ? ' ok' : ''), ok ? 'מאושרת' : cnt + ' מתוך ' + v.questions.length + ' אושרו'));
      d.appendChild(sum);
      const body = el('div', 'vbody');
      v.questions.forEach((q, qi) => {
        const row = el('div', 'q' + (q.ok ? ' ok' : ''));
        const t = el('div', 'qt', (qi + 1) + '. ' + q.q + ' '); t.appendChild(el('small', '', q.hard ? '(קשה)' : '(קלה)'));
        row.appendChild(t);
        q.options.forEach((o, k) => row.appendChild(el('div', 'o' + (k === q.answer ? ' c' : ''), (k === q.answer ? '✓ ' : '• ') + o)));
        const acts = el('div', 'acts');
        const yes = el('button', 'yes' + (q.ok ? ' on' : ''), q.ok ? 'אושרה' : 'אשר'); yes.type = 'button';
        yes.addEventListener('click', () => { q.ok = !q.ok; save(); render(); });
        const rep = el('button', '', 'החלף שאלה'); rep.type = 'button';
        rep.addEventListener('click', () => { S.data.versions[vi] = Q.replaceQuestion(S.menu, v, qi, Date.now() % 100000); save(); render(); });
        acts.append(yes, rep); row.appendChild(acts); body.appendChild(row);
      });
      const va = el('div', 'vact');
      const all = el('button', 'all', 'אשר את כל השאלות בגרסה'); all.type = 'button';
      all.addEventListener('click', () => { v.questions.forEach(q => { q.ok = true; }); save(); render(); });
      const tryA = el('a', '', 'נסה את הגרסה'); tryA.href = 'quiz.html?practice&v=' + encodeURIComponent(v.id); tryA.target = '_blank'; tryA.rel = 'noopener';
      va.append(all, tryA); body.appendChild(va);
      d.appendChild(body); list.appendChild(d);
    });
  }

  function download() {
    // הטיוטה נשמרת כאן; הקובץ שמורידים הוא quiz-data.json שמחליף את הקובץ באתר
    const blob = new Blob([JSON.stringify(S.data)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'quiz-data.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('הקובץ ירד. החלף בו את menu/quiz-data.json באתר.');
  }

  $('#download').addEventListener('click', download);
  $('#rebuild').addEventListener('click', () => {
    if (!confirm('לבנות את כל 10 הגרסאות מחדש? האישורים הקיימים יימחקו.')) return;
    S.data = Q.buildVersions(S.menu); S.open = null; save(); render();
  });
  $('#resetDraft').addEventListener('click', () => {
    if (!confirm('לזרוק את כל השינויים ולחזור לקובץ שבאתר?')) return;
    try { localStorage.removeItem(DRAFT); } catch (e) {}
    $('#draftNote').hidden = true; load();
  });
  load().catch(() => toast('לא הצלחתי לטעון את הנתונים. רענן.'));
})();
