/* ═══════════════════════════════════════════════════════
   Learning Hub — SPA Application
   Router · State Machine · MCQ Quiz Engine
   ═══════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const $app = document.getElementById('app');

  /* ── API Helper ────────────────────────────────────── */
  async function api(path, opts = {}) {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Request failed');
    }
    return res.status === 204 ? null : res.json();
  }

  /* ── Toast System ──────────────────────────────────── */
  function toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    el.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  /* ── Utilities ─────────────────────────────────────── */
  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function timeAgo(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'ממש עכשיו';
    if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דקות`;
    if (diff < 86400) return `לפני ${Math.floor(diff / 3600)} שעות`;
    return `לפני ${Math.floor(diff / 86400)} ימים`;
  }

  function escapeHtml(s) {
    if (!s) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function showSummaryModal(summaryText) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content" style="max-width:600px; max-height:80vh; overflow-y:auto; text-align:right;">
        <h2 style="margin-bottom:1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;">📖 סיכום הרצאה</h2>
        <div class="summary-text" style="font-size: 1rem; line-height: 1.7; white-space: pre-wrap; margin-bottom: 1.5rem;">${escapeHtml(summaryText)}</div>
        <div class="modal-actions" style="border-top: 1px solid var(--border); padding-top: 1rem;">
          <button class="btn btn-primary" id="modal-close-summary">סגור</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.getElementById('modal-close-summary').addEventListener('click', () => overlay.remove());
  }

  /* ── Router ────────────────────────────────────────── */
  function navigate(hash) {
    window.location.hash = hash;
  }

  function getRoute() {
    const hash = window.location.hash || '#/';
    const match = hash.match(/^#\/course\/(\d+)/);
    if (match) return { view: 'course', courseId: parseInt(match[1], 10) };
    return { view: 'home' };
  }

  async function onRoute() {
    const route = getRoute();
    $app.innerHTML = '<div class="loading-state"><div class="spinner spinner-lg"></div>טוען...</div>';
    try {
      if (route.view === 'course') await renderCourseDetail(route.courseId);
      else await renderHome();
    } catch (err) {
      console.error(err);
      $app.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>משהו השתבש</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  window.addEventListener('hashchange', onRoute);
  window.addEventListener('DOMContentLoaded', onRoute);

  /* ═════════════════════════════════════════════════════
     VIEW 1: Home — Course Dashboard
     ═════════════════════════════════════════════════════ */
  async function renderHome() {
    const courses = await api('/courses');

    $app.innerHTML = `
      <div class="page-header">
        <h1>📚 הקורסים שלך</h1>
        <button class="btn btn-primary" id="btn-new-course">
          <span>+</span> קורס חדש
        </button>
      </div>
      ${courses.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">🎓</div>
             <h3>אין קורסים עדיין</h3>
             <p>צור את הקורס הראשון שלך כדי להתחיל להעלות הרצאות ולבנות את חפיסת הכרטיסיות שלך.</p>
             <button class="btn btn-primary btn-lg" id="btn-empty-create">צור קורס</button>
           </div>`
        : `<div class="course-grid">${courses.map(courseCardHtml).join('')}</div>`
      }
    `;

    // Event listeners
    document.getElementById('btn-new-course')?.addEventListener('click', showCreateModal);
    document.getElementById('btn-empty-create')?.addEventListener('click', showCreateModal);

    $app.querySelectorAll('.course-card').forEach((el) => {
      const id = el.dataset.id;
      el.addEventListener('click', (e) => {
        if (e.target.closest('.delete-btn')) return;
        navigate(`#/course/${id}`);
      });
    });

    $app.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        if (!confirm(`מחק "${name}" וכל ההרצאות והכרטיסיות שלו?`)) return;
        try {
          await api(`/courses/${id}`, { method: 'DELETE' });
          toast('הקורס נמחק', 'success');
          renderHome();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  function courseCardHtml(c) {
    const hasDue = c.due_count > 0;
    return `
      <div class="card course-card" data-id="${c.id}">
        <div class="card-header">
          <div>
            <div class="card-title">${escapeHtml(c.name)}</div>
            <div style="margin-top:0.5rem">
              ${hasDue
                ? `<span class="badge badge-danger">🔒 ${c.due_count} לביצוע כעת</span>`
                : `<span class="badge badge-success">✓ הכל נקי</span>`
              }
            </div>
          </div>
          <button class="delete-btn" data-id="${c.id}" data-name="${escapeHtml(c.name)}" title="מחק קורס">🗑️</button>
        </div>
        <div class="card-stats">
          <div class="stat">
            <span class="stat-value">${c.lecture_count}</span>
            <span class="stat-label">הרצאות</span>
          </div>
          <div class="stat">
            <span class="stat-value">${c.flashcard_count}</span>
            <span class="stat-label">כרטיסיות</span>
          </div>
          <div class="stat">
            <span class="stat-value">${c.due_count}</span>
            <span class="stat-label">לביצוע כעת</span>
          </div>
        </div>
      </div>
    `;
  }

  /* ── צור קורס Modal ───────────────────────────── */
  function showCreateModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content">
        <h2>📁 קורס חדש</h2>
        <div class="form-group">
          <label for="course-name">שם הקורס</label>
          <input class="input" id="course-name" type="text" placeholder="למשל: אלגברה לינארית" autofocus />
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="modal-cancel">ביטול</button>
          <button class="btn btn-primary" id="modal-create">צור</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.getElementById('modal-cancel').addEventListener('click', () => overlay.remove());

    const input = document.getElementById('course-name');
    const createBtn = document.getElementById('modal-create');

    async function doCreate() {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      createBtn.innerHTML = '<div class="spinner"></div>';
      createBtn.disabled = true;
      try {
        await api('/courses', {
          method: 'POST',
          body: JSON.stringify({ name }),
        });
        overlay.remove();
        toast('הקורס נוצר!', 'success');
        renderHome();
      } catch (err) {
        toast(err.message, 'error');
        createBtn.textContent = 'צור';
        createBtn.disabled = false;
      }
    }

    createBtn.addEventListener('click', doCreate);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCreate(); });
    setTimeout(() => input.focus(), 100);
  }

  /* ═════════════════════════════════════════════════════
     VIEW 2: Course Detail
     ═════════════════════════════════════════════════════ */
  async function renderCourseDetail(courseId) {
    const [course, lectures] = await Promise.all([
      api(`/courses/${courseId}`),
      api(`/courses/${courseId}/lectures`),
    ]);

    $app.innerHTML = `
      <a href="#/" class="back-link">← חזור לקורסים</a>
      <div class="page-header">
        <h1>${escapeHtml(course.name)}</h1>
        <div class="card-stats" style="gap:1.5rem">
          <div class="stat"><span class="stat-value">${course.lecture_count}</span><span class="stat-label">הרצאות</span></div>
          <div class="stat"><span class="stat-value">${course.flashcard_count}</span><span class="stat-label">כרטיסיות</span></div>
          <div class="stat"><span class="stat-value">${course.due_count}</span><span class="stat-label">לביצוע כעת</span></div>
        </div>
      </div>

      <div class="state-banner state-banner-learn" style="margin-bottom: 2rem;">
        <div class="state-icon">📖</div>
        <div class="state-info">
          <h3>מוכן ללמידה</h3>
          <p>העלה הרצאה חדשה כדי להתחיל ברצף הלמידה.</p>
        </div>
      </div>

      <div class="upload-section" id="upload-section">
        <div class="form-group" style="display:flex; gap:1rem;">
          <div style="flex:1;">
            <label for="lecture-title">שם ההרצאה</label>
            <input class="input" id="lecture-title" type="text" placeholder="למשל: פרק 5: ערכים עצמיים" />
          </div>
          <div style="flex:1;">
            <label for="lecture-pages">עמודים לחילוץ (אופציונלי)</label>
            <input class="input" id="lecture-pages" type="text" placeholder="למשל: 1-5, 8, 11-13" />
          </div>
        </div>
        <div class="upload-zone" id="upload-zone">
          <div class="upload-icon">📄</div>
          <div class="upload-label">גרור את ה-PDF שלך לכאן או לחץ לעיון</div>
          <div class="upload-hint">עד 50 מגה-בייט · קבצי PDF בלבד</div>
          <input type="file" id="pdf-input" accept="application/pdf" hidden />
        </div>
        <div id="file-name-display" style="margin-top:0.75rem; font-size:0.85rem; color:var(--text-secondary); display:none;"></div>
        <div style="margin-top:1rem; text-align:right;">
          <button class="btn btn-success btn-lg" id="btn-upload" disabled>
            העלה והתחל רצף למידה
          </button>
        </div>
      </div>

      ${lectures.length > 0 ? renderLectureList(lectures) : ''}
    `;

    initUploadEngine(courseId);

    $app.querySelectorAll('.view-summary-btn').forEach((btn, idx) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        showSummaryModal(lectures[idx].summary_content);
      });
    });

    $app.querySelectorAll('.delete-lecture-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        if (!confirm(`האם למחוק את ההרצאה "${name}" ואת כל הכרטיסיות שלה?`)) return;
        try {
          await api(`/lectures/${id}`, { method: 'DELETE' });
          toast('ההרצאה נמחקה', 'success');
          renderCourseDetail(courseId);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  /* ── Lecture List ───────────────────────────────────── */
  function renderLectureList(lectures) {
    return `
      <div class="lecture-list" style="margin-top: 3rem;">
        <h3 style="margin-bottom:0.75rem; color:var(--text-secondary); font-size:0.85rem; text-transform:uppercase; letter-spacing:0.06em;">📚 היסטוריית הרצאות</h3>
        ${lectures.map((l) => `
          <div class="lecture-item" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div class="lecture-title">${escapeHtml(l.title)}</div>
              <div class="lecture-meta">${l.flashcard_count} כרטיסיות · ${timeAgo(l.created_at)}</div>
            </div>
            <div>
              <button class="view-summary-btn btn btn-ghost" title="הצג סיכום" style="color:var(--primary); padding:0.25rem 0.5rem; font-size:1.2rem;">📖</button>
              <button class="delete-lecture-btn btn btn-ghost" data-id="${l.id}" data-name="${escapeHtml(l.title)}" title="מחק הרצאה" style="color:var(--danger); padding:0.25rem 0.5rem; font-size:1.2rem;">🗑️</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════
     רצף למידה Controller
     ═════════════════════════════════════════════════════ */
  async function startLearningSequence(courseId, uploadFormData) {
    const uploadBtn = document.getElementById('btn-upload');
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<div class="spinner"></div> מעבד...';

    try {
      // Stage 1: Upload & AI Generation + Fetch Due כרטיסיות
      const [uploadResult, dueכרטיסיות] = await Promise.all([
        fetch(`/api/courses/${courseId}/lectures`, {
          method: 'POST',
          body: uploadFormData,
        }).then(r => r.json()),
        api(`/courses/${courseId}/due`)
      ]);

      if (uploadResult.error) throw new Error(uploadResult.error);

      const summary = uploadResult.lecture.summary_content;
      const newFlashcards = uploadResult.new_flashcards;

      // Replace view with Sequence UI
      $app.innerHTML = `
        <div class="page-header" style="text-align:center; display:flex; flex-direction:column; align-items:center;">
          <h1 style="font-size:1.8rem;">רצף למידה</h1>
          <p style="color:var(--text-secondary); margin-top:0.5rem;">עקוב אחר השלבים כדי לשלוט בחומר.</p>
        </div>
        <div id="sequence-container" style="max-width: 600px; margin: 0 auto;"></div>
      `;

      const seqContainer = document.getElementById('sequence-container');

      // Stage 1: SM-2 Reviews
      if (dueכרטיסיות && dueכרטיסיות.length > 0) {
        await runSM2Reviews(courseId, dueכרטיסיות, seqContainer);
      } else {
        await new Promise(resolve => {
          seqContainer.innerHTML = `
            <div class="state-banner state-banner-review" style="opacity: 0.8;">
              <div class="state-icon">🔒</div>
              <div class="state-info">
                <h3>שלב 1: חזרה על הרצאות קודמות</h3>
                <p>אין שאלות לחזרה כרגע. אתה מעודכן!</p>
              </div>
            </div>
            <div style="margin-top:2rem; text-align:right;">
              <button class="btn btn-primary btn-lg" id="btn-skip-review">
                המשך לסיכום →
              </button>
            </div>
          `;
          document.getElementById('btn-skip-review').addEventListener('click', resolve);
        });
      }

      // Stage 2: Summary Phase
      if (summary) {
        await runSummaryPhase(summary, seqContainer);
      }

      // Stage 3: Easy Questions Phase
      if (newFlashcards && newFlashcards.length > 0) {
        await runNewQuestions(courseId, newFlashcards, seqContainer);
      }

      toast('הרצף הושלם! 🎉', 'success');
      renderCourseDetail(courseId);

    } catch (err) {
      toast(err.message, 'error');
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = 'העלה והתחל רצף למידה';
    }
  }

  /* ── Stage 2: SM-2 Reviews ───────────────────────────── */
  function runSM2Reviews(courseId, dueכרטיסיות, container) {
    return new Promise((resolve) => {
      let currentIndex = 0;
      let totalReviewed = 0;
      const totalכרטיסיות = dueכרטיסיות.length;

      function renderCurrentCard() {
        if (currentIndex >= totalכרטיסיות) {
          resolve(); // Finished reviews
          return;
        }

        const card = dueכרטיסיות[currentIndex];
        const distractors = JSON.parse(card.distractors);
        const options = shuffleArray([card.correct_answer, ...distractors]);
        const keys = ['A', 'B', 'C', 'D'];

        container.innerHTML = `
          <div class="state-banner state-banner-review">
            <div class="state-icon">🔒</div>
            <div class="state-info">
              <h3>שלב 1: חזרה על הרצאות קודמות</h3>
              <p>ענה על ${totalכרטיסיות - currentIndex} שאלות לפני למידת חומר חדש.</p>
            </div>
          </div>
          
          <div class="progress-wrapper" style="margin-top: 1.5rem;">
            <div class="progress-header">
              <span>התקדמות</span>
              <span>${currentIndex} / ${totalכרטיסיות}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${(currentIndex / totalכרטיסיות) * 100}%"></div>
            </div>
          </div>

          <div class="quiz-card" style="margin-top:1.5rem;">
            <div class="lecture-tag" style="display:flex; justify-content:space-between; align-items:center;">
              <span>📖 ${escapeHtml(card.lecture_title)}</span>
              ${card.lecture_summary ? `<button class="btn btn-ghost btn-sm btn-show-summary" style="padding:0.2rem 0.5rem;">הצג סיכום</button>` : ''}
            </div>
            <div class="question-text">${escapeHtml(card.question_text)}</div>
            <ul class="options-list">
              ${options.map((opt, i) => `
                <li>
                  <button class="option-btn" data-answer="${escapeHtml(opt)}" data-correct="${opt === card.correct_answer}">
                    <span class="option-key">${keys[i]}</span>
                    <span>${escapeHtml(opt)}</span>
                  </button>
                </li>
              `).join('')}
            </ul>
            <div id="feedback-slot"></div>
          </div>
        `;

        const summaryBtn = container.querySelector('.btn-show-summary');
        if (summaryBtn) {
          summaryBtn.addEventListener('click', () => {
            showSummaryModal(card.lecture_summary);
          });
        }

        container.querySelectorAll('.option-btn').forEach((btn) => {
          btn.addEventListener('click', () => handleAnswer(card, btn, container));
        });
      }

      async function handleAnswer(card, selectedBtn, container) {
        const allBtns = container.querySelectorAll('.option-btn');
        allBtns.forEach((b) => b.classList.add('disabled'));

        const isCorrect = selectedBtn.dataset.correct === 'true';
        const quality = isCorrect ? 5 : 1;

        if (isCorrect) {
          selectedBtn.classList.add('correct');
        } else {
          selectedBtn.classList.add('incorrect');
          allBtns.forEach((b) => {
            if (b.dataset.correct === 'true') b.classList.add('reveal-correct');
          });
        }

        const feedbackSlot = document.getElementById('feedback-slot');
        feedbackSlot.innerHTML = `
          <div class="feedback-area ${isCorrect ? 'feedback-correct' : 'feedback-incorrect'}">
            <span class="feedback-icon">${isCorrect ? '🎯' : '❌'}</span>
            <div class="feedback-text">
              ${isCorrect
                ? '<strong>נכון!</strong> זיכרון מצוין.'
                : `<strong>לא נכון.</strong> התשובה הנכונה היא: <strong>${escapeHtml(card.correct_answer)}</strong>`
              }
            </div>
          </div>
          <div style="text-align:right; margin-top:1rem;">
            <button class="btn btn-primary" id="btn-next-card">
              ${currentIndex + 1 < totalכרטיסיות ? 'חזרה הבאה →' : 'המשך לסיכום →'}
            </button>
          </div>
        `;

        try {
          await api(`/flashcards/${card.id}/review`, {
            method: 'POST',
            body: JSON.stringify({ quality }),
          });
        } catch (err) {}

        totalReviewed++;

        document.getElementById('btn-next-card').addEventListener('click', () => {
          currentIndex++;
          renderCurrentCard();
        });
      }

      renderCurrentCard();
    });
  }

  /* ── Stage 2: Summary ────────────────────────────────── */
  function runSummaryPhase(summaryText, container) {
    return new Promise((resolve) => {
      container.innerHTML = `
        <div class="state-banner state-banner-learn" style="background: rgba(59,130,246,0.1); border-color: #3b82f6;">
          <div class="state-icon">💡</div>
          <div class="state-info">
            <h3>שלב 2: סיכום הרצאה חדשה</h3>
            <p>קרא את הסיכום שהופק על ידי ה-AI.</p>
          </div>
        </div>
        <div class="summary-card" style="margin-top:2rem;">
          <div class="summary-text" style="font-size: 1.1rem; line-height: 1.7; white-space: pre-wrap;">${escapeHtml(summaryText)}</div>
        </div>
        <div style="margin-top:2rem; text-align:right;">
          <button class="btn btn-primary btn-lg" id="btn-finish-summary">
            התחל שאלות על ההרצאה החדשה →
          </button>
        </div>
      `;

      document.getElementById('btn-finish-summary').addEventListener('click', () => {
        resolve();
      });
    });
  }

  /* ── Stage 3: Easy Questions (New Material) ──────────── */
  function runNewQuestions(courseId, newכרטיסיות, container) {
    return new Promise((resolve) => {
      let currentIndex = 0;
      const totalכרטיסיות = newכרטיסיות.length;

      function renderCurrentCard() {
        if (currentIndex >= totalכרטיסיות) {
          resolve();
          return;
        }

        const card = newכרטיסיות[currentIndex];
        const distractors = typeof card.distractors === 'string' ? JSON.parse(card.distractors) : card.distractors;
        const options = shuffleArray([card.correct_answer, ...distractors]);
        const keys = ['A', 'B', 'C', 'D'];

        container.innerHTML = `
          <div class="state-banner state-banner-learn" style="background: rgba(16,185,129,0.1); border-color: var(--success);">
            <div class="state-icon">📝</div>
            <div class="state-info">
              <h3>שלב 3: בוחן על חומר חדש</h3>
              <p>בחן את הידע שלך מיד על המושגים החדשים.</p>
            </div>
          </div>
          
          <div class="progress-wrapper" style="margin-top: 1.5rem;">
            <div class="progress-header">
              <span>התקדמות בבוחן</span>
              <span>${currentIndex} / ${totalכרטיסיות}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${(currentIndex / totalכרטיסיות) * 100}%"></div>
            </div>
          </div>

          <div class="quiz-card" style="margin-top:1.5rem;">
            <div class="lecture-tag" style="display:flex; justify-content:space-between; align-items:center;">
              <span>📖 ${escapeHtml(card.lecture_title || 'הרצאה חדשה')}</span>
              ${card.lecture_summary ? `<button class="btn btn-ghost btn-sm btn-show-summary" style="padding:0.2rem 0.5rem;">הצג סיכום</button>` : ''}
            </div>
            <div class="question-text">${escapeHtml(card.question_text)}</div>
            <ul class="options-list">
              ${options.map((opt, i) => `
                <li>
                  <button class="option-btn" data-answer="${escapeHtml(opt)}" data-correct="${opt === card.correct_answer}">
                    <span class="option-key">${keys[i]}</span>
                    <span>${escapeHtml(opt)}</span>
                  </button>
                </li>
              `).join('')}
            </ul>
            <div id="feedback-slot"></div>
          </div>
        `;

        const summaryBtn = container.querySelector('.btn-show-summary');
        if (summaryBtn) {
          summaryBtn.addEventListener('click', () => {
            showSummaryModal(card.lecture_summary);
          });
        }

        container.querySelectorAll('.option-btn').forEach((btn) => {
          btn.addEventListener('click', () => handleAnswer(card, btn, container));
        });
      }

      async function handleAnswer(card, selectedBtn, container) {
        const allBtns = container.querySelectorAll('.option-btn');
        allBtns.forEach((b) => b.classList.add('disabled'));

        const isCorrect = selectedBtn.dataset.correct === 'true';
        const quality = isCorrect ? 5 : 1;

        if (isCorrect) {
          selectedBtn.classList.add('correct');
        } else {
          selectedBtn.classList.add('incorrect');
          allBtns.forEach((b) => {
            if (b.dataset.correct === 'true') b.classList.add('reveal-correct');
          });
        }

        const feedbackSlot = document.getElementById('feedback-slot');
        feedbackSlot.innerHTML = `
          <div class="feedback-area ${isCorrect ? 'feedback-correct' : 'feedback-incorrect'}">
            <span class="feedback-icon">${isCorrect ? '🎯' : '❌'}</span>
            <div class="feedback-text">
              ${isCorrect
                ? '<strong>נכון!</strong>'
                : `<strong>לא נכון.</strong> התשובה הנכונה היא: <strong>${escapeHtml(card.correct_answer)}</strong>`
              }
            </div>
          </div>
          <div style="text-align:right; margin-top:1rem;">
            <button class="btn btn-primary" id="btn-next-card">
              ${currentIndex + 1 < totalכרטיסיות ? 'שאלה הבאה →' : 'סיים רצף ✓'}
            </button>
          </div>
        `;

        // Record the initial attempt via SM-2
        try {
          if (card.id) {
            await api(`/flashcards/${card.id}/review`, {
              method: 'POST',
              body: JSON.stringify({ quality }),
            });
          }
        } catch (err) {}

        document.getElementById('btn-next-card').addEventListener('click', () => {
          currentIndex++;
          renderCurrentCard();
        });
      }

      renderCurrentCard();
    });
  }

  /* ═════════════════════════════════════════════════════
     Upload Engine UI Bindings
     ═════════════════════════════════════════════════════ */
  function initUploadEngine(courseId) {
    const zone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('pdf-input');
    const titleInput = document.getElementById('lecture-title');
    const pagesInput = document.getElementById('lecture-pages');
    const uploadBtn = document.getElementById('btn-upload');
    const fileDisplay = document.getElementById('file-name-display');

    if (!zone) return;

    let selectedFile = null;

    function checkReady() {
      uploadBtn.disabled = !(titleInput.value.trim() && selectedFile);
    }

    zone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        selectedFile = fileInput.files[0];
        fileDisplay.style.display = 'block';
        fileDisplay.innerHTML = `📎 <strong>${escapeHtml(selectedFile.name)}</strong> (${(selectedFile.size / 1024).toFixed(0)} KB)`;
        zone.style.borderColor = 'var(--success)';
        zone.style.background = 'rgba(16,185,129,0.04)';
      }
      checkReady();
    });

    titleInput.addEventListener('input', checkReady);

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type === 'application/pdf') {
        selectedFile = file;
        fileDisplay.style.display = 'block';
        fileDisplay.innerHTML = `📎 <strong>${escapeHtml(file.name)}</strong> (${(file.size / 1024).toFixed(0)} KB)`;
        zone.style.borderColor = 'var(--success)';
        zone.style.background = 'rgba(16,185,129,0.04)';
      } else {
        toast('מתקבלים קבצי PDF בלבד', 'error');
      }
      checkReady();
    });

    uploadBtn.addEventListener('click', () => {
      if (!selectedFile || !titleInput.value.trim()) return;
      const formData = new FormData();
      formData.append('title', titleInput.value.trim());
      if (pagesInput && pagesInput.value.trim()) {
        formData.append('pageRange', pagesInput.value.trim());
      }
      formData.append('pdf', selectedFile);
      startLearningSequence(courseId, formData);
    });
  }
})();
