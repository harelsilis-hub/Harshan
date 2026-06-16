const fs = require('fs');

let appJs = fs.readFileSync('./public/js/app.js', 'utf8');

const hybridCardLogic = `
      function renderCurrentCard() {
        if (currentIndex >= totalכרטיסיות) {
          resolve();
          return;
        }

        const card = STATE_VAR[currentIndex];
        let distractors = [];
        try {
          distractors = typeof card.distractors === 'string' ? JSON.parse(card.distractors) : (card.distractors || []);
        } catch(e) {}
        if (!Array.isArray(distractors)) distractors = [];

        const isMCQ = distractors.length > 0;
        const options = isMCQ ? shuffleArray([card.correct_answer, ...distractors]) : [];
        const keys = ['A', 'B', 'C', 'D'];

        container.innerHTML = \`
          BANNER_HTML
          
          <div class="progress-wrapper" style="margin-top: 1.5rem;">
            <div class="progress-header">
              <span>התקדמות</span>
              <span>\${currentIndex} / \${totalכרטיסיות}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: \${(currentIndex / totalכרטיסיות) * 100}%\"></div>
            </div>
          </div>

          <div class="quiz-card" style="margin-top:1.5rem;">
            <div class="lecture-tag" style="display:flex; justify-content:space-between; align-items:center;">
              <span>📖 \${escapeHtml(card.lecture_title || 'הרצאה')}</span>
              \${card.lecture_summary ? \\\`<button class="btn btn-ghost btn-sm btn-show-summary" style="padding:0.2rem 0.5rem;">הצג סיכום</button>\\\` : ''}
            </div>
            <div class="question-text markdown-body" dir="rtl" style="margin-bottom: 1.5rem;">\${renderMarkdown(card.question_text)}</div>
            
            \${isMCQ ? \\\`
            <ul class="options-list">
              \${options.map((opt, i) => \\\`
                <li>
                  <button class="option-btn" data-answer="\${escapeHtml(opt)}" data-correct="\${opt === card.correct_answer}">
                    <span class="option-key">\${keys[i]}</span>
                    <span class="option-content markdown-body" dir="rtl">\${renderMarkdown(opt)}</span>
                  </button>
                </li>
              \\\`).join('')}
            </ul>
            \\\` : \\\`
            <div class="flashcard-ui" style="text-align: center;">
              <button class="btn btn-primary" id="btn-reveal-answer" style="width: 100%; padding: 1rem; font-size: 1.1rem;">הצג תשובה</button>
              <div id="flashcard-answer-slot" style="display: none; margin-top: 1.5rem; border-top: 1px solid var(--border); padding-top: 1.5rem;">
                <h4 style="margin-bottom: 1rem; color: var(--text-secondary);">תשובה נכונה:</h4>
                <div class="markdown-body answer-reveal-box" dir="rtl" style="font-size: 1.1rem; margin-bottom: 2rem; background: var(--bg-secondary); padding: 1rem; border-radius: 8px;">
                  \${renderMarkdown(card.correct_answer)}
                </div>
                <h4 style="margin-bottom: 1rem; color: var(--text-secondary);">עד כמה ידעת את התשובה?</h4>
                <div class="sm2-buttons" style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                  <button class="btn sm2-btn" style="background: var(--error); color: white; flex:1;" data-quality="1">שכחתי (1)</button>
                  <button class="btn sm2-btn" style="background: var(--warning); color: black; flex:1;" data-quality="3">קשה (3)</button>
                  <button class="btn sm2-btn" style="background: var(--primary); color: white; flex:1;" data-quality="4">טוב (4)</button>
                  <button class="btn sm2-btn" style="background: var(--success); color: white; flex:1;" data-quality="5">קל (5)</button>
                </div>
              </div>
            </div>
            \\\`}
            <div id="feedback-slot"></div>
          </div>
        \`;

        const summaryBtn = container.querySelector('.btn-show-summary');
        if (summaryBtn) {
          summaryBtn.addEventListener('click', () => {
            showSummaryModal(card.lecture_summary);
          });
        }

        if (isMCQ) {
          container.querySelectorAll('.option-btn').forEach((btn) => {
            btn.addEventListener('click', () => handleAnswer(card, btn, container, true));
          });
        } else {
          const revealBtn = container.querySelector('#btn-reveal-answer');
          const answerSlot = container.querySelector('#flashcard-answer-slot');
          revealBtn.addEventListener('click', () => {
            revealBtn.style.display = 'none';
            answerSlot.style.display = 'block';
          });
          container.querySelectorAll('.sm2-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              const quality = parseInt(btn.dataset.quality, 10);
              handleAnswer(card, null, container, false, quality);
            });
          });
        }
      }

      async function handleAnswer(card, selectedBtn, container, isMCQ, manualQuality = null) {
        let quality = manualQuality;
        let isCorrect = quality ? quality >= 3 : false;

        if (isMCQ) {
          const allBtns = container.querySelectorAll('.option-btn');
          allBtns.forEach((b) => b.classList.add('disabled'));

          isCorrect = selectedBtn.dataset.correct === 'true';
          quality = isCorrect ? 5 : 1;

          if (isCorrect) {
            selectedBtn.classList.add('correct');
          } else {
            selectedBtn.classList.add('incorrect');
            allBtns.forEach((b) => {
              if (b.dataset.correct === 'true') b.classList.add('reveal-correct');
            });
          }
        } else {
          container.querySelectorAll('.sm2-btn').forEach(b => b.classList.add('disabled'));
        }

        const feedbackSlot = document.getElementById('feedback-slot');
        if (isMCQ) {
          feedbackSlot.innerHTML = \`
            <div class="feedback-area \${isCorrect ? 'feedback-correct' : 'feedback-incorrect'}">
              <span class="feedback-icon">\${isCorrect ? '🎯' : '❌'}</span>
              <div class="feedback-text">
                \${isCorrect
                  ? '<strong>נכון!</strong> זיכרון מצוין.'
                  : \\\`<strong>לא נכון.</strong> התשובה הנכונה היא: <div class="markdown-body" style="display:inline-block; vertical-align:top;">\${renderMarkdown(card.correct_answer)}</div>\\\`
                }
              </div>
            </div>
            <div style="text-align:right; margin-top:1rem;">
              <button class="btn btn-primary" id="btn-next-card">
                NEXT_BTN_TEXT
              </button>
            </div>
          \`;
        } else {
          feedbackSlot.innerHTML = \`
            <div class="feedback-area \${isCorrect ? 'feedback-correct' : 'feedback-incorrect'}">
              <span class="feedback-icon">\${isCorrect ? '🎯' : '💪'}</span>
              <div class="feedback-text">
                נשמר בזיכרון. (דירוג: \${quality})
              </div>
            </div>
            <div style="text-align:right; margin-top:1rem;">
              <button class="btn btn-primary" id="btn-next-card">
                NEXT_BTN_TEXT
              </button>
            </div>
          \`;
        }

        try {
          const res = await api(\`/flashcards/\${card.id}/review\`, {
            method: 'POST',
            body: JSON.stringify({ quality, user_id: currentUser ? currentUser.id : null }),
          });
          if (res && res.user) {
            currentUser = res.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateNav();
          }
        } catch (err) {}

        if (typeof totalReviewed !== 'undefined') {
          totalReviewed++;
        }

        document.getElementById('btn-next-card').addEventListener('click', () => {
          currentIndex++;
          renderCurrentCard();
        });
      }`;

const reviewBanner = `<div class="state-banner state-banner-review">
            <div class="state-icon">\${isCramMode ? '🔥' : '🔒'}</div>
            <div class="state-info">
              <h3>\${isCramMode ? 'מצב חרישה' : 'שלב 1: חזרה על הרצאות קודמות'}</h3>
              <p>\${isCramMode ? \`ענה על \${totalכרטיסיות - currentIndex} שאלות.\` : \`ענה על \${totalכרטיסיות - currentIndex} שאלות לפני למידת חומר חדש.\`}</p>
            </div>
          </div>`;

const newBanner = `<div class="state-banner state-banner-learn" style="background: rgba(16,185,129,0.1); border-color: var(--success);">
            <div class="state-icon">📝</div>
            <div class="state-info">
              <h3>שלב 3: בוחן על חומר חדש</h3>
              <p>בחן את הידע שלך מיד על המושגים החדשים.</p>
            </div>
          </div>`;

const reviewLogic = hybridCardLogic
  .replace(/STATE_VAR/g, 'dueכרטיסיות')
  .replace('BANNER_HTML', reviewBanner)
  .replace(/NEXT_BTN_TEXT/g, "\\${currentIndex + 1 < totalכרטיסיות ? 'שאלה הבאה →' : (isCramMode ? 'סיים חרישה ✓' : 'המשך לסיכום →')}");

const newLogic = hybridCardLogic
  .replace(/STATE_VAR/g, 'newכרטיסיות')
  .replace('BANNER_HTML', newBanner)
  .replace(/NEXT_BTN_TEXT/g, "\\${currentIndex + 1 < totalכרטיסיות ? 'שאלה הבאה →' : 'סיים רצף ✓'}");

const reviewStart = appJs.indexOf('function renderCurrentCard() {', appJs.indexOf('function runReviewQuestions'));
const reviewEnd = appJs.indexOf('renderCurrentCard();', reviewStart);
if (reviewStart !== -1 && reviewEnd !== -1) {
  appJs = appJs.substring(0, reviewStart) + reviewLogic + '\\n\\n      ' + appJs.substring(reviewEnd);
} else {
  console.log("Could not find review render block");
}

const newStart = appJs.indexOf('function renderCurrentCard() {', appJs.indexOf('function runNewQuestions'));
const newEnd = appJs.indexOf('renderCurrentCard();', newStart);
if (newStart !== -1 && newEnd !== -1) {
  appJs = appJs.substring(0, newStart) + newLogic + '\\n\\n      ' + appJs.substring(newEnd);
} else {
  console.log("Could not find new render block");
}

fs.writeFileSync('./public/js/app.js', appJs);
console.log('App.js patched successfully!');
