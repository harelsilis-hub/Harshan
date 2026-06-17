/* ═══════════════════════════════════════════════════════
   Learning Hub — SPA Application
   Router · State Machine · MCQ Quiz Engine
   ═══════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const $app = document.getElementById('app');

  /* ── API Helper ────────────────────────────────────── */
  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...opts.headers };
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.token) {
      headers['Authorization'] = `Bearer ${currentUser.token}`;
    }

    const res = await fetch(`/api${path}`, {
      ...opts,
      headers
    });
    if (!res.ok) {
      const errPayload = await res.json().catch(() => ({ error: res.statusText }));
      const errorObj = new Error(errPayload.error || 'Request failed');
      Object.assign(errorObj, errPayload);
      throw errorObj;
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

  function confirmModal(message) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-content" style="max-width: 400px; text-align: center; border-radius: 12px; padding: 2rem;">
          <h3 style="margin-bottom: 1rem; color: var(--text-primary);">אישור פעולה</h3>
          <p style="margin-bottom: 1.5rem; color: var(--text-secondary); line-height: 1.5;">${message.replace(/\n/g, '<br>')}</p>
          <div class="modal-actions" style="display: flex; gap: 1rem; justify-content: center;">
            <button id="custom-confirm-yes" class="btn btn-primary" style="flex: 1;">כן</button>
            <button id="custom-confirm-no" class="btn" style="flex: 1; background: var(--surface); color: var(--text-primary); border: 1px solid var(--border);">לא</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      document.getElementById('custom-confirm-yes').addEventListener('click', () => {
        overlay.remove();
        resolve(true);
      });
      document.getElementById('custom-confirm-no').addEventListener('click', () => {
        overlay.remove();
        resolve(false);
      });
    });
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

  function renderMarkdown(text) {
    if (!text) return '';
    
    // 1. Extract Math to protect it from marked.js parsing (e.g. asterisks becoming italics)
    const mathBlocks = [];
    
    // Match $$...$$
    let safeText = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, math) => {
      mathBlocks.push({ display: true, math });
      return `@@MATH_${mathBlocks.length - 1}@@`;
    });
    
    // Match $...$
    safeText = safeText.replace(/\$([^\$]*?)\$/g, (match, math) => {
      mathBlocks.push({ display: false, math });
      return `@@MATH_${mathBlocks.length - 1}@@`;
    });
    
    // Escape < and > for regular text to prevent HTML tag parsing issues
    safeText = safeText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // 2. Parse markdown
    let html = marked.parse(safeText);
    
    // 3. Restore Math blocks
    html = html.replace(/@@MATH_(\d+)@@/g, (match, i) => {
      const block = mathBlocks[i];
      // Escape < and > inside math so browser doesn't parse them as HTML tags,
      // KaTeX will read the DOM text nodes and see the actual < and > characters.
      const escapedMath = block.math.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const delim = block.display ? '$$' : '$';
      return `<span class="raw-math">${delim}${escapedMath}${delim}</span>`;
    });
    
    const div = document.createElement('div');
    div.innerHTML = html;
    
    // 4. Render KaTeX math
    if (window.renderMathInElement) {
      window.renderMathInElement(div, {
        delimiters: [
          {left: '$$', right: '$$', display: true},
          {left: '$', right: '$', display: false}
        ],
        throwOnError: false
      });
    }
    
    // 5. Fix bidi for pure math/english that wasn't wrapped in KaTeX
    const walk = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, null, false);
    let node;
    const nodesToReplace = [];
    while(node = walk.nextNode()) {
      const p = node.parentElement;
      if (p && (
        p.closest('code') || 
        p.closest('bdi') || 
        p.closest('.katex') || 
        p.closest('.katex-error') || 
        p.closest('.raw-math') // Just in case KaTeX fails
      )) continue;
      
      if (/[a-zA-Z0-9=<>\+\-\*]/.test(node.nodeValue)) {
        nodesToReplace.push(node);
      }
    }
    
    nodesToReplace.forEach(n => {
      const fragments = document.createDocumentFragment();
      let lastIndex = 0;
      let match;
      const simpleRegex = /([a-zA-Z0-9\(\)\[\]\{\}\+\-\*\/\=\<\>_][a-zA-Z0-9\(\)\[\]\{\}\+\-\*\/\=\<\>_\s\.,]*[a-zA-Z0-9\(\)\[\]\{\}\+\-\*\/\=\<\>_]|[a-zA-Z0-9\=\<\>])/g;
      
      while ((match = simpleRegex.exec(n.nodeValue)) !== null) {
        if (/[a-zA-Z0-9=<>\+\-\*]/.test(match[0])) {
          if (match.index > lastIndex) {
            fragments.appendChild(document.createTextNode(n.nodeValue.substring(lastIndex, match.index)));
          }
          const bdi = document.createElement('bdi');
          bdi.dir = 'ltr';
          bdi.textContent = match[0];
          fragments.appendChild(bdi);
          lastIndex = simpleRegex.lastIndex;
        }
      }
      if (lastIndex < n.nodeValue.length) {
        fragments.appendChild(document.createTextNode(n.nodeValue.substring(lastIndex)));
      }
      if (fragments.childNodes.length > 0) {
        n.parentNode.replaceChild(fragments, n);
      }
    });
    
    return div.innerHTML;
  }

  function showSummaryModal(summaryText) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content" style="max-width:600px; max-height:80vh; overflow-y:auto; text-align:right;">
        <h2 style="margin-bottom:1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;">📖 סיכום הרצאה</h2>
        <div class="summary-text markdown-body" style="font-size: 1rem; line-height: 1.7; margin-bottom: 1.5rem;" dir="auto">${renderMarkdown(summaryText)}</div>
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
    if (hash === '#/community') return { view: 'community' };
    if (hash === '#/tasks') return { view: 'tasks' };
    if (hash === '#/login') return { view: 'auth', mode: 'login' };
    if (hash === '#/register') return { view: 'auth', mode: 'register' };
    
    let match = hash.match(/^#\/course\/(\d+)/);
    if (match) return { view: 'course', courseId: parseInt(match[1], 10) };
    
    match = hash.match(/^#\/semester\/(\d+)/);
    if (match) return { view: 'semester', semesterId: parseInt(match[1], 10) };

    return { view: 'home' };
  }

  let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  
  // Temporary state for new user Google Auth
  let pendingGoogleCredential = null;

  async function renderAuth() {
    $app.innerHTML = `
      <div class="auth-container">
        <div class="auth-card fade-in">
          <div class="auth-header">
            <div class="auth-icon">🧠</div>
            <h2>ברוך הבא!</h2>
            <p id="auth-subtitle">התחבר לחשבון שלך כדי להמשיך ללמוד</p>
          </div>
          
          <!-- Login View -->
          <div id="login-view">
            <div id="google-btn-login-container" style="display:flex; justify-content:center; margin-top: 1rem; opacity: 0.5; pointer-events: none; filter: grayscale(100%);" title="Google Login is temporarily disabled"></div>
            <p style="text-align: center; font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.5rem; opacity: 0.8;">ההתחברות כרגע מאופשרת רק על ידי אימייל וסיסמא עקב מגבלות ההאקטון</p>
            
            <div class="divider" style="margin: 1.5rem 0; text-align: center; color: var(--text-secondary); font-size: 0.9rem; position: relative;">
               <span style="background: var(--bg-card); padding: 0 10px; position: relative; z-index: 1;">או באמצעות אימייל</span>
               <hr style="position: absolute; top: 50%; left: 0; right: 0; margin: 0; border: none; border-top: 1px solid var(--border); z-index: 0;">
            </div>

            <form id="email-login-form" class="auth-form">
              <div class="form-group">
                <label>אימייל</label>
                <input class="input" id="login-email" type="email" required>
              </div>
              <div class="form-group" style="margin-top: 1rem;">
                <label>סיסמה</label>
                <input class="input" id="login-password" type="password" required>
              </div>
              <button type="submit" class="btn btn-primary auth-submit-btn" style="margin-top: 1.5rem;">התחברות</button>
            </form>
            <div style="text-align: center; margin-top: 1rem; font-size: 0.9rem;">
              <a href="#" id="link-to-register" style="color: var(--primary); text-decoration: none;">אין לך חשבון? הירשם כאן</a>
            </div>
          </div>

          <!-- Register View -->
          <div id="register-view" style="display: none;">
            <div id="google-btn-register-container" style="display:flex; justify-content:center; margin-top: 1rem; opacity: 0.5; pointer-events: none; filter: grayscale(100%);" title="Google Login is temporarily disabled"></div>
            <p style="text-align: center; font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.5rem; opacity: 0.8;">ההתחברות כרגע מאופשרת רק על ידי אימייל וסיסמא עקב מגבלות ההאקטון</p>
            
            <div class="divider" style="margin: 1.5rem 0; text-align: center; color: var(--text-secondary); font-size: 0.9rem; position: relative;">
               <span style="background: var(--bg-card); padding: 0 10px; position: relative; z-index: 1;">או הרשמה באימייל</span>
               <hr style="position: absolute; top: 50%; left: 0; right: 0; margin: 0; border: none; border-top: 1px solid var(--border); z-index: 0;">
            </div>

            <form id="email-register-form" class="auth-form">
              <div class="form-group">
                <label>אימייל</label>
                <input class="input" id="reg-email" type="email" required>
              </div>
              <div class="form-group" style="margin-top: 1rem;">
                <label>סיסמה</label>
                <input class="input" id="reg-password" type="password" required minlength="6">
              </div>
              <div class="form-group" style="margin-top: 1rem;">
                <label>שם מלא</label>
                <input class="input" id="reg-name" type="text" required>
              </div>
              <div class="form-group" style="margin-top: 1rem;">
                <label>אוניברסיטה / מוסד לימודים</label>
                <input class="input" id="reg-university" list="universities-list" required>
              </div>
              <div class="form-group" style="margin-top: 1rem;">
                <label>תואר נלמד</label>
                <input class="input" id="reg-degree" list="degrees-list" required>
              </div>
              <div class="form-row" style="margin-top: 1rem;">
                <div class="form-group">
                  <label>שנת לימוד (1-7)</label>
                  <input class="input" id="reg-year" type="number" min="1" max="7" required>
                </div>
                <div class="form-group">
                  <label>סמסטר (1-3)</label>
                  <input class="input" id="reg-semester" type="number" min="1" max="3" required>
                </div>
              </div>
              <button type="submit" class="btn btn-primary auth-submit-btn" style="margin-top: 1.5rem;">הרשמה</button>
            </form>
            <div style="text-align: center; margin-top: 1rem; font-size: 0.9rem;">
              <a href="#" id="link-to-login" style="color: var(--primary); text-decoration: none;">כבר יש לך חשבון? התחבר כאן</a>
            </div>
          </div>

          <!-- Google Profile Completion View -->
          <div id="google-profile-view" style="display: none;">
            <h3 style="text-align: center; margin-bottom: 1.5rem; color: var(--text);">השלמת פרטים מזהים</h3>
            <form id="google-profile-form" class="auth-form">
              <div class="form-group">
                <label>שם מלא</label>
                <input class="input" id="gp-name" type="text" required>
              </div>
              <div class="form-group" style="margin-top: 1rem;">
                <label>אוניברסיטה / מוסד לימודים</label>
                <input class="input" id="gp-university" list="universities-list" required>
              </div>
              <div class="form-group" style="margin-top: 1rem;">
                <label>תואר נלמד</label>
                <input class="input" id="gp-degree" list="degrees-list" required>
              </div>
              <div class="form-row" style="margin-top: 1rem;">
                <div class="form-group">
                  <label>שנת לימוד (1-7)</label>
                  <input class="input" id="gp-year" type="number" min="1" max="7" required>
                </div>
                <div class="form-group">
                  <label>סמסטר (1-3)</label>
                  <input class="input" id="gp-semester" type="number" min="1" max="3" required>
                </div>
              </div>
              <button type="submit" class="btn btn-primary auth-submit-btn" id="btn-submit-gp" style="margin-top: 1.5rem;">סיום הרשמה</button>
            </form>
          </div>

          <datalist id="universities-list">
            <option value="אוניברסיטת תל אביב">
            <option value="האוניברסיטה העברית בירושלים">
            <option value="הטכניון - מכון טכנולוגי לישראל">
            <option value="אוניברסיטת בן-גוריון בנגב">
            <option value="אוניברסיטת בר-אילן">
            <option value="אוניברסיטת חיפה">
            <option value="אוניברסיטת אריאל בשומרון">
            <option value="מכון ויצמן למדע">
            <option value="האוניברסיטה הפתוחה">
            <option value="אוניברסיטת רייכמן">
            <option value="המסלול האקדמי המכללה למינהל">
            <option value="המכון הטכנולוגי חולון (HIT)">
            <option value="המכללה האקדמית תל אביב יפו">
            <option value="שנקר - הנדסה. עיצוב. אמנות">
            <option value="המכללה האקדמית ספיר">
            <option value="המכללה האקדמית עמק יזרעאל">
            <option value="המכללה האקדמית תל-חי">
            <option value="המכללה האקדמית אשקלון">
            <option value="המכללה האקדמית סמי שמעון (SCE)">
            <option value="המכללה האקדמית הדסה ירושלים">
            <option value="המכללה האקדמית רופין">
            <option value="המכללה האקדמית נתניה">
            <option value="בצלאל אקדמיה לאמנות ועיצוב">
          </datalist>

          <datalist id="degrees-list">
            <!-- Populated dynamically from degrees.json -->
          </datalist>

        </div>
      </div>
    `;

    // Fetch and populate degrees dynamically
    const STATIC_DEGREES = [
      "מדעי המחשב", "הנדסת תוכנה", "הנדסת מערכות מידע", "הנדסת חשמל ואלקטרוניקה",
      "רפואה", "משפטים", "כלכלה וחשבונאות", "מנהל עסקים", "פסיכולוגיה",
      "הנדסת תעשייה וניהול", "מדעי הנתונים", "ביולוגיה", "פיזיקה", "מתמטיקה", "תקשורת"
    ];

    function populateDegrees(degreesArray) {
      const list = document.getElementById('degrees-list');
      if (!list) return;
      list.innerHTML = degreesArray.map(d => `<option value="${d}">`).join('');
    }

    // Load default static list
    populateDegrees(STATIC_DEGREES);

    let cachedBguDegrees = null;
    let isFetchingBgu = true;

    // Pre-fetch BGU data in the background
    api('/degrees/bgu')
      .then(degrees => {
        cachedBguDegrees = degrees.map(d => d.name);
        isFetchingBgu = false;
        // If the user already selected BGU, update the list immediately
        const regUni = document.getElementById('reg-university');
        const gpUni = document.getElementById('gp-university');
        if ((regUni && regUni.value.trim() === 'אוניברסיטת בן-גוריון בנגב') || 
            (gpUni && gpUni.value.trim() === 'אוניברסיטת בן-גוריון בנגב')) {
          populateDegrees(cachedBguDegrees);
        }
      })
      .catch(err => {
        console.error('Failed to pre-fetch BGU degrees:', err);
        isFetchingBgu = false;
        
        // Update UI to fallback to static degrees if user selected BGU
        const regUni = document.getElementById('reg-university');
        const gpUni = document.getElementById('gp-university');
        if ((regUni && regUni.value.trim() === 'אוניברסיטת בן-גוריון בנגב') || 
            (gpUni && gpUni.value.trim() === 'אוניברסיטת בן-גוריון בנגב')) {
          populateDegrees(STATIC_DEGREES);
        }
      });

    function handleUniversityChange(e) {
      const university = e.target.value.trim();
      const list = document.getElementById('degrees-list');
      
      if (university === 'אוניברסיטת בן-גוריון בנגב') {
        if (cachedBguDegrees) {
          populateDegrees(cachedBguDegrees);
        } else if (isFetchingBgu) {
          if (list) list.innerHTML = '<option value="טוען נתונים מבן-גוריון...">';
        } else {
          populateDegrees(STATIC_DEGREES);
        }
      } else {
        populateDegrees(STATIC_DEGREES);
      }
    }

    // Attach listeners
    document.getElementById('reg-university')?.addEventListener('input', handleUniversityChange);
    document.getElementById('gp-university')?.addEventListener('input', handleUniversityChange);

    // View Toggles
    document.getElementById('link-to-register').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-view').style.display = 'none';
      document.getElementById('register-view').style.display = 'block';
      document.getElementById('auth-subtitle').textContent = 'צור משתמש חדש והתחל ללמוד';
    });

    document.getElementById('link-to-login').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('register-view').style.display = 'none';
      document.getElementById('login-view').style.display = 'block';
      document.getElementById('auth-subtitle').textContent = 'התחבר לחשבון שלך כדי להמשיך ללמוד';
    });

    // Google Auth Logic
    const initGoogle = () => {
      if (window.google && google.accounts && google.accounts.id) {
        google.accounts.id.initialize({
          client_id: '611572387185-locggqgusn3a64r1eijdei4gege59ltf.apps.googleusercontent.com',
          callback: handleGoogleAuth
        });
        google.accounts.id.renderButton(document.getElementById('google-btn-login-container'), { theme: 'filled_black', size: 'large', type: 'standard', shape: 'pill', text: 'signin_with' });
        google.accounts.id.renderButton(document.getElementById('google-btn-register-container'), { theme: 'filled_black', size: 'large', type: 'standard', shape: 'pill', text: 'signup_with' });
      } else {
        setTimeout(initGoogle, 100);
      }
    };
    initGoogle();

    async function handleGoogleAuth(response) {
      pendingGoogleCredential = response.credential;
      await attemptGoogleLogin({ credential: pendingGoogleCredential });
    }

    async function attemptGoogleLogin(payload) {
      try {
        const user = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        finishLogin(user);
      } catch (err) {
        if (err.requiresProfileCompletion) {
          document.getElementById('login-view').style.display = 'none';
          document.getElementById('register-view').style.display = 'none';
          document.getElementById('google-profile-view').style.display = 'block';
          if (err.name) document.getElementById('gp-name').value = err.name;
          toast('אנא השלם את פרטי ההרשמה.', 'info');
        } else {
          toast(err.message || 'שגיאה בהתחברות לגוגל', 'error');
        }
      }
    }

    // Finish Login Helper
    function finishLogin(user) {
      currentUser = user;
      localStorage.setItem('currentUser', JSON.stringify(user));
      pendingGoogleCredential = null;
      window.location.hash = '#/';
      if (window.location.hash === '#/') onRoute();
    }

    // Google Profile Completion Submit
    document.getElementById('google-profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!pendingGoogleCredential) return;
      
      const payload = {
        credential: pendingGoogleCredential,
        university: document.getElementById('gp-university').value.trim(),
        degree: document.getElementById('gp-degree').value.trim(),
        year: document.getElementById('gp-year').value,
        semester: document.getElementById('gp-semester').value,
        leaderboard_name: document.getElementById('gp-name').value.trim()
      };

      const btn = document.getElementById('btn-submit-gp');
      btn.disabled = true; btn.textContent = 'טוען...';
      await attemptGoogleLogin(payload);
      btn.disabled = false; btn.textContent = 'סיום הרשמה מול גוגל';
    });

    // Email Login Submit
    document.getElementById('email-login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const btn = e.target.querySelector('button');
      
      try {
        btn.disabled = true; btn.textContent = 'מתחבר...';
        const user = await api('/auth/login-email', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
        finishLogin(user);
      } catch (err) {
        toast(err.message || 'שגיאה בהתחברות', 'error');
      } finally {
        btn.disabled = false; btn.textContent = 'התחברות';
      }
    });

    // Email Register Submit
    document.getElementById('email-register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        email: document.getElementById('reg-email').value.trim(),
        password: document.getElementById('reg-password').value,
        university: document.getElementById('reg-university').value.trim(),
        degree: document.getElementById('reg-degree').value.trim(),
        year: document.getElementById('reg-year').value,
        semester: document.getElementById('reg-semester').value,
        leaderboard_name: document.getElementById('reg-name').value.trim()
      };
      const btn = e.target.querySelector('button');
      
      try {
        btn.disabled = true; btn.textContent = 'רושם משתמש...';
        const user = await api('/auth/register-email', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        finishLogin(user);
        toast('נרשמת בהצלחה!', 'success');
      } catch (err) {
        toast(err.message || 'שגיאה בהרשמה', 'error');
      } finally {
        btn.disabled = false; btn.textContent = 'הרשמה';
      }
    });
  }

  function getTitleForLevel(level) {
    if (level < 5) return 'תלמיד מתחיל';
    if (level < 10) return 'סטודנט מצטיין';
    if (level < 20) return 'תותח אקדמי';
    if (level < 30) return 'עוזר מחקר';
    if (level < 50) return 'מרצה חבר';
    return 'פרופסור מן המניין';
  }

  function updateNav() {
    const topnav = document.getElementById('topnav');
    const greeting = document.getElementById('nav-greeting');
    const gamification = document.getElementById('nav-gamification');
    const btnLogout = document.getElementById('btn-logout');
    
    const route = getRoute();

    if (topnav) {
      topnav.style.display = route.view === 'auth' ? 'none' : 'flex';
    }
    
    if (currentUser && route.view !== 'auth') {
      if (greeting) {
        const displayName = currentUser.leaderboard_name || currentUser.username;
        greeting.textContent = 'שלום ' + displayName;
        greeting.style.display = 'inline';
      }
      if (btnLogout) btnLogout.style.display = 'inline-block';
      if (gamification && currentUser.level !== undefined) {
        gamification.style.display = 'flex';
        document.getElementById('nav-level').textContent = `רמה ${currentUser.level}: ${getTitleForLevel(currentUser.level)}`;
        document.getElementById('nav-xp').textContent = `${currentUser.xp} XP`;
        document.getElementById('nav-streak').textContent = `🔥 ${currentUser.current_streak}`;
        document.getElementById('nav-reputation').textContent = `⭐ ${currentUser.reputation}`;
      } else if (gamification) {
        gamification.style.display = 'none';
      }
    } else {
      if (greeting) greeting.style.display = 'none';
      if (btnLogout) btnLogout.style.display = 'none';
      if (gamification) gamification.style.display = 'none';
    }
  }

  async function onRoute() {
    const route = getRoute();
    
    if (!currentUser && route.view !== 'auth') {
      navigate('#/login');
      return;
    }

    updateNav();

    if (route.view === 'auth') {
      await renderAuth(route.mode);
      return;
    }

    $app.innerHTML = '<div class="loading-state"><div class="spinner spinner-lg"></div>טוען...</div>';
    try {
      if (route.view === 'course') await renderCourseDetail(route.courseId);
      else if (route.view === 'semester') await renderSemesterDetail(route.semesterId);
      else if (route.view === 'community') await renderCommunity();
      else if (route.view === 'tasks') await renderTasks();
      else await renderHome();
    } catch (err) {
      console.error(err);
      $app.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>משהו השתבש</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  window.addEventListener('hashchange', onRoute);
  window.addEventListener('DOMContentLoaded', () => {
    onRoute();
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        currentUser = null;
        localStorage.removeItem('currentUser');
        window.location.hash = '#/login';
      });
    }
  });

  /* ═════════════════════════════════════════════════════
     VIEW: Tasks / Deadlines
     ═════════════════════════════════════════════════════ */
  async function renderTasks() {
    $app.innerHTML = `
      <div class="page-header" style="flex-direction:column; align-items:flex-start; gap: 1rem;">
        <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
          <h1>📋 מטלות (Moodle Deadlines)</h1>
          <button class="btn btn-primary" id="btn-sync-moodle">
            <span>🔄</span> סנכרן עם Moodle
          </button>
        </div>
      </div>
      <div id="tasks-container" style="margin-top:2rem;">
        <div class="loading-state"><div class="spinner spinner-lg"></div>טוען...</div>
      </div>
    `;

    document.getElementById('btn-sync-moodle').addEventListener('click', showSyncMoodleModal);

    try {
      const events = await api(`/calendar?user_id=${currentUser.id}`);
      const container = document.getElementById('tasks-container');

      if (events.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📅</div>
            <h3>אין לך מטלות עדיין</h3>
            <p>לחץ על סנכרן כדי למשוך את המטלות והדדליינים מהמודל שלך.</p>
          </div>
        `;
        return;
      }

      // Group by course ID (Moodle puts course ID in categories string)
      const courses = {};
      for (const e of events) {
        const cId = e.moodle_course_id || 'כללי';
        if (!courses[cId]) courses[cId] = [];
        courses[cId].push(e);
      }

      let html = '<div class="course-grid" style="display: flex; flex-direction: column; gap: 1.5rem;">';
      for (const cId in courses) {
        const sortedEvents = courses[cId].sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
        
        html += `
          <div class="card" style="padding:0;">
            <div class="card-header" style="background:var(--bg-card); cursor:pointer;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
              <h3 style="margin:0; color:var(--primary);">📁 קורס #${cId} <span class="badge badge-warning" style="margin-right:1rem;">${sortedEvents.length} מטלות</span></h3>
            </div>
            <div class="card-body" style="padding: 1.5rem;">
              <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:1rem;">
        `;

        for (const e of sortedEvents) {
          const now = new Date();
          const dateObj = new Date(e.event_date);
          const timeDiff = dateObj - now; // milliseconds
          
          const isPast = timeDiff < 0;
          const isSoon = !isPast && timeDiff <= 24 * 60 * 60 * 1000;
          const isCompleted = e.is_completed === 1;
          
          const displayDate = dateObj.toLocaleString('he-IL', { dateStyle: 'medium', timeStyle: 'short' });
          
          let bgColor = 'transparent';
          if (!isCompleted) {
            if (isPast) bgColor = 'rgba(255, 0, 0, 0.15)'; // red background
            else if (isSoon) bgColor = 'rgba(255, 165, 0, 0.2)'; // orange background
          }
          
          const isStriked = isCompleted;
          
          html += `
                <li style="display:flex; justify-content:space-between; align-items:center; padding:1rem; border-bottom:1px solid var(--border); background-color: ${bgColor}; border-radius: 8px; margin-bottom: 0.5rem; transition: background-color 0.3s;">
                  <div style="display:flex; align-items:center; gap: 1rem; flex:1;">
                    <input type="checkbox" class="task-checkbox" data-id="${e.id}" ${isCompleted ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer; accent-color: var(--primary);">
                    <div>
                      <div style="font-weight:600; font-size:1.1rem; text-decoration: ${isStriked ? 'line-through' : 'none'}; color:${isStriked ? 'var(--text-secondary)' : 'var(--text-primary)'}">${escapeHtml(e.title)}</div>
                      <div style="color:var(--text-secondary); font-size:0.9rem; margin-top:0.25rem;">
                         ${isPast ? '✅ חלף התאריך' : '⏳'} ${displayDate}
                      </div>
                    </div>
                  </div>
                </li>
          `;
        }
        
        html += `
              </ul>
            </div>
          </div>
        `;
      }
      html += '</div>';
      container.innerHTML = html;

      // Attach event listeners for checkboxes
      container.querySelectorAll('.task-checkbox').forEach(cb => {
        cb.addEventListener('change', async (e) => {
          const id = e.target.getAttribute('data-id');
          const is_completed = e.target.checked;
          try {
            await api('/calendar/' + id + '/toggle', {
              method: 'PUT',
              body: JSON.stringify({ is_completed })
            });
            renderTasks();
          } catch (err) {
            console.error(err);
            toast('שגיאה בעדכון המטלה', 'error');
            e.target.checked = !is_completed;
          }
        });
      });

    } catch (error) {
      document.getElementById('tasks-container').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <h3>שגיאה בטעינת המטלות</h3>
          <p>${escapeHtml(error.message)}</p>
        </div>
      `;
    }
  }

  function showSyncMoodleModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content" style="text-align:right;">
        <h2>🔄 סנכרון עם BGU Moodle</h2>
        <p style="color:var(--text-secondary); margin-bottom:1.5rem;">
          הכנס את פרטי ההתחברות שלך למודל. הפרטים אינם נשמרים בשרת ומשמשים באופן חד-פעמי למשיכת האירועים.
        </p>
        <div class="form-group">
          <label>שם משתמש (Moodle)</label>
          <input class="input" id="sync-username" type="text" placeholder="הכנס שם משתמש" autofocus />
        </div>
        <div class="form-group" style="margin-top:1rem;">
          <label>סיסמה</label>
          <input class="input" id="sync-password" type="password" placeholder="הכנס סיסמה" />
        </div>
        <div class="modal-actions" style="margin-top:2rem;">
          <button class="btn btn-ghost" id="modal-cancel">ביטול</button>
          <button class="btn btn-primary" id="modal-sync">סנכרן עכשיו</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.getElementById('modal-cancel').addEventListener('click', () => overlay.remove());

    const syncBtn = document.getElementById('modal-sync');
    syncBtn.addEventListener('click', async () => {
      const u = document.getElementById('sync-username').value;
      const p = document.getElementById('sync-password').value;
      if (!u || !p) return toast('חובה להזין שם משתמש וסיסמה', 'warning');
      
      syncBtn.disabled = true;
      syncBtn.innerHTML = '<div class="spinner"></div> ממתין ל-Moodle... (כ-10 שניות)';
      
      try {
        const result = await api('/calendar/sync-moodle', {
          method: 'POST',
          body: JSON.stringify({ moodle_username: u, moodle_password: p, user_id: currentUser.id })
        });
        
        overlay.remove();
        toast(`סנכרון הושלם! נוספו ${result.addedCount} מטלות חדשות.`, 'success');
        renderTasks();
      } catch (err) {
        toast('שגיאה: ' + err.message, 'error');
        syncBtn.disabled = false;
        syncBtn.innerHTML = 'סנכרן עכשיו';
      }
    });
  }

  /* ═════════════════════════════════════════════════════
     VIEW 1: Home — Semester Dashboard
     ═════════════════════════════════════════════════════ */
  async function renderHome() {
    const semesters = await api('/semesters');

    $app.innerHTML = `
      <div class="page-header">
        <h1>📁 הסמסטרים שלך</h1>
        <button class="btn btn-primary" id="btn-new-semester">
          <span>+</span> סמסטר חדש
        </button>
      </div>
      ${semesters.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">📅</div>
             <h3>אין סמסטרים עדיין</h3>
             <p>צור תיקיית סמסטר כדי לארגן את הקורסים שלך.</p>
             <button class="btn btn-primary btn-lg" id="btn-empty-create-semester">צור סמסטר</button>
           </div>`
        : `<div class="course-grid">${semesters.map(s => `
             <div class="card course-card" data-id="${s.id}" data-type="semester">
               <div class="card-header">
                 <div>
                   <div class="card-title">${escapeHtml(s.name)}</div>
                   <div style="margin-top:0.5rem">
                     <span class="badge badge-success">${s.course_count} קורסים</span>
                   </div>
                 </div>
                 <button class="delete-btn" data-id="${s.id}" data-name="${escapeHtml(s.name)}" data-type="semester" title="מחק סמסטר">🗑️</button>
               </div>
             </div>
           `).join('')}</div>`
      }
    `;

    document.getElementById('btn-new-semester')?.addEventListener('click', showCreateSemesterModal);
    document.getElementById('btn-empty-create-semester')?.addEventListener('click', showCreateSemesterModal);

    $app.querySelectorAll('.course-card[data-type="semester"]').forEach((el) => {
      const id = el.dataset.id;
      el.addEventListener('click', (e) => {
        if (e.target.closest('.delete-btn')) return;
        navigate(`#/semester/${id}`);
      });
    });

    $app.querySelectorAll('.delete-btn[data-type="semester"]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        const approved = await confirmModal(`מחק "${name}" וכל הקורסים בתוכו?`);
        if (!approved) return;
        try {
          await api(`/semesters/${id}`, { method: 'DELETE' });
          toast('הסמסטר נמחק', 'success');
          renderHome();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  function showCreateSemesterModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content" style="text-align:right;">
        <h2>📅 סמסטר חדש</h2>
        <div class="form-group">
          <label>שם הסמסטר</label>
          <input class="input" id="semester-name" type="text" placeholder="למשל: שנה א׳ סמסטר א׳" autofocus />
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

    const input = document.getElementById('semester-name');
    const createBtn = document.getElementById('modal-create');

    async function doCreate() {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      createBtn.innerHTML = '<div class="spinner"></div>';
      createBtn.disabled = true;
      try {
        await api('/semesters', {
          method: 'POST',
          body: JSON.stringify({ name }),
        });
        overlay.remove();
        toast('הסמסטר נוצר!', 'success');
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
     VIEW 1.5: Semester Detail
     ═════════════════════════════════════════════════════ */
  async function renderSemesterDetail(semesterId) {
    const [semester, courses] = await Promise.all([
      api(`/semesters/${semesterId}`),
      api(`/courses?semester_id=${semesterId}`)
    ]);

    $app.innerHTML = `
      <a href="#/" class="back-link">← חזור לסמסטרים</a>
      <div class="page-header">
        <h1>📚 ${escapeHtml(semester.name)}</h1>
        <button class="btn btn-primary" id="btn-new-course">
          <span>+</span> קורס חדש
        </button>
      </div>
      ${courses.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">🎓</div>
             <h3>אין קורסים בסמסטר זה</h3>
             <button class="btn btn-primary btn-lg" id="btn-empty-create-course">צור קורס</button>
           </div>`
        : `<div class="course-grid">${courses.map(courseCardHtml).join('')}</div>`
      }
    `;

    document.getElementById('btn-new-course')?.addEventListener('click', () => showCreateCourseModal(semesterId));
    document.getElementById('btn-empty-create-course')?.addEventListener('click', () => showCreateCourseModal(semesterId));

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
        const approved = await confirmModal(`מחק "${name}" וכל ההרצאות והכרטיסיות שלו?`);
        if (!approved) return;
        try {
          await api(`/courses/${id}`, { method: 'DELETE' });
          toast('הקורס נמחק', 'success');
          renderSemesterDetail(semesterId);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  function showCreateCourseModal(semesterId) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content" style="text-align:right;">
        <h2>📁 קורס חדש</h2>
        <div class="form-group">
          <label>שם הקורס</label>
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
          body: JSON.stringify({ name, semester_id: semesterId }),
        });
        overlay.remove();
        toast('הקורס נוצר!', 'success');
        renderSemesterDetail(semesterId);
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

  /* ═════════════════════════════════════════════════════
     VIEW 2: Course Detail
     ═════════════════════════════════════════════════════ */
  async function renderCourseDetail(courseId) {
    const [course, lectures] = await Promise.all([
      api(`/courses/${courseId}`),
      api(`/courses/${courseId}/lectures`),
    ]);

    $app.innerHTML = `
      <a href="#/semester/${course.semester_id}" class="back-link">← חזור לקורסים</a>
      <div class="page-header" style="align-items:flex-start;">
        <div>
          <h1>${escapeHtml(course.name)}</h1>
          <div class="card-stats" style="gap:1.5rem; margin-top:0.5rem;">
            <div class="stat"><span class="stat-value">${course.lecture_count}</span><span class="stat-label">הרצאות</span></div>
            <div class="stat"><span class="stat-value">${course.flashcard_count}</span><span class="stat-label">כרטיסיות</span></div>
            <div class="stat"><span class="stat-value">${course.due_count}</span><span class="stat-label">לביצוע כעת</span></div>
          </div>
        </div>
        <button class="btn btn-warning" id="btn-cram-mode" style="background:#f59e0b; border-color:#f59e0b; color:white; font-weight:600;">🔥 מצב חרישה</button>
      </div>

      ${course.due_count > 0 ? `
      <div class="state-banner state-banner-review" style="margin-bottom: 2rem; background: rgba(16,185,129,0.1); border-color: #10b981;">
        <div class="state-icon">✅</div>
        <div class="state-info">
          <h3>יש לך ${course.due_count} כרטיסיות לביצוע כעת!</h3>
          <p>זה הזמן לחזור על החומר כדי שלא תשכח.</p>
        </div>
        <button class="btn btn-success" id="btn-review-due" style="margin-right:auto;">התחל חזרה</button>
      </div>
      ` : ''}

      ${course.pending_count > 0 ? `
      <div class="state-banner state-banner-learn" style="margin-bottom: 2rem; background: rgba(59,130,246,0.1); border-color: #3b82f6;">
        <div class="state-icon">🆕</div>
        <div class="state-info">
          <h3>יש לך ${course.pending_count} כרטיסיות חדשות שממתינות ללמידה!</h3>
          <p>לחץ כדי לפתוח וללמוד מנה של עד 15 כרטיסיות חדשות.</p>
        </div>
        <button class="btn btn-primary" id="btn-learn-pending" style="margin-right:auto;">למד עכשיו</button>
      </div>
      ` : (course.due_count === 0 ? `
      <div class="state-banner state-banner-learn" style="margin-bottom: 2rem;">
        <div class="state-icon">📖</div>
        <div class="state-info">
          <h3>מוכן ללמידה</h3>
          <p>העלה הרצאה חדשה כדי להתחיל ברצף הלמידה.</p>
        </div>
      </div>
      ` : '')}

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

    const learnPendingBtn = document.getElementById('btn-learn-pending');
    if (learnPendingBtn) {
      learnPendingBtn.addEventListener('click', async () => {
        try {
          learnPendingBtn.innerHTML = '<div class="spinner"></div>';
          learnPendingBtn.disabled = true;
          const res = await api(`/courses/${courseId}/drip-feed`, { 
            method: 'POST', 
            body: JSON.stringify({ limit: 15 }) 
          });
          
          if (!res.cards || res.cards.length === 0) {
            toast('אין כרטיסיות חדשות זמינות.', 'warning');
            renderCourseDetail(courseId);
            return;
          }

          $app.innerHTML = `
            <div class="page-header" style="text-align:center; display:flex; flex-direction:column; align-items:center;">
              <h1 style="font-size:1.8rem;">כרטיסיות חדשות</h1>
              <p style="color:var(--text-secondary); margin-top:0.5rem;">לומדים כעת ${res.cards.length} מושגים חדשים.</p>
            </div>
            <div id="sequence-container" style="max-width: 600px; margin: 0 auto;"></div>
          `;
          const seqContainer = document.getElementById('sequence-container');
          await runSM2Reviews(courseId, res.cards, seqContainer);
          toast('סיימת ללמוד את מקבץ הכרטיסיות החדשות!', 'success');
          renderCourseDetail(courseId);
        } catch (err) {
          toast('שגיאה בטעינת כרטיסיות: ' + err.message, 'error');
          learnPendingBtn.innerHTML = 'למד עכשיו';
          learnPendingBtn.disabled = false;
        }
      });
    }

    const reviewDueBtn = document.getElementById('btn-review-due');
    if (reviewDueBtn) {
      reviewDueBtn.addEventListener('click', async () => {
        try {
          reviewDueBtn.innerHTML = '<div class="spinner"></div>';
          reviewDueBtn.disabled = true;
          const dueCards = await api(`/courses/${courseId}/due`);
          
          if (!dueCards || dueCards.length === 0) {
            toast('אין כרטיסיות לביצוע כעת.', 'warning');
            renderCourseDetail(courseId);
            return;
          }

          $app.innerHTML = `
            <div class="page-header" style="text-align:center; display:flex; flex-direction:column; align-items:center;">
              <h1 style="font-size:1.8rem;">חזרה על חומר קודם</h1>
              <p style="color:var(--text-secondary); margin-top:0.5rem;">סקור כרטיסיות כדי לשפר את הזיכרון.</p>
            </div>
            <div id="sequence-container" style="max-width: 600px; margin: 0 auto;"></div>
          `;
          const seqContainer = document.getElementById('sequence-container');
          await runSM2Reviews(courseId, dueCards, seqContainer);
          toast('סיימת את כל החזרות להיום!', 'success');
          renderCourseDetail(courseId);
        } catch (err) {
          toast('שגיאה בטעינת החזרה', 'error');
          reviewDueBtn.innerHTML = 'התחל חזרה';
          reviewDueBtn.disabled = false;
        }
      });
    }

    const cramBtn = document.getElementById('btn-cram-mode');
    if (cramBtn) {
      cramBtn.addEventListener('click', async () => {
        // Show loading state
        const originalText = cramBtn.innerHTML;
        cramBtn.innerHTML = 'מייצר שאלות... <span style="display:inline-block; animation: spin 1s linear infinite;">⏳</span>';
        cramBtn.disabled = true;

        try {
          const cramCards = await api(`/courses/${courseId}/cram-generate`, { method: 'POST' });
          if (!cramCards || cramCards.length === 0) {
            toast('אין מספיק חומר בקורס כדי לייצר שאלות.', 'warning');
            cramBtn.innerHTML = originalText;
            cramBtn.disabled = false;
            return;
          }
          
          $app.innerHTML = `
            <div class="page-header" style="text-align:center; display:flex; flex-direction:column; align-items:center;">
              <h1 style="font-size:1.8rem; color:#f59e0b;">🔥 מצב חרישה</h1>
              <p style="color:var(--text-secondary); margin-top:0.5rem;">10 שאלות ייחודיות שנוצרו במיוחד עבורך.</p>
            </div>
            <div id="sequence-container" style="max-width: 600px; margin: 0 auto;"></div>
          `;
          const seqContainer = document.getElementById('sequence-container');
          await runSM2Reviews(courseId, cramCards, seqContainer, true);
          toast('סיימת מצב חרישה! כל הכבוד!', 'success');
          renderCourseDetail(courseId);
        } catch (err) {
          toast('שגיאה ביצירת שאלות: ' + err.message, 'error');
          cramBtn.innerHTML = originalText;
          cramBtn.disabled = false;
        }
      });
    }

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
        const approved = await confirmModal(`האם למחוק את ההרצאה "${name}" ואת כל הכרטיסיות שלה?`);
        if (!approved) return;
        try {
          await api(`/lectures/${id}`, { method: 'DELETE' });
          toast('ההרצאה נמחקה', 'success');
          renderCourseDetail(courseId);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    $app.querySelectorAll('.share-lecture-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          btn.disabled = true;
          await api(`/lectures/${btn.dataset.id}/share`, {
            method: 'POST',
            body: JSON.stringify({ is_public: 1 })
          });
          toast('הסיכום שותף עם הקהילה!', 'success');
          renderCourseDetail(courseId);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    $app.querySelectorAll('.download-lecture-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const id = parseInt(btn.dataset.id, 10);
          const response = await fetch('/api/lectures/' + id + '/download', {
            headers: { 'Authorization': 'Bearer ' + currentUser.token }
          });
          if (!response.ok) {
             const errorData = await response.json().catch(() => ({}));
             throw new Error(errorData.error || 'Failed to download PDF');
          }
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          const lect = lectures.find(x => x.id === id) || { title: 'lecture' };
          a.download = lect.title + '.pdf';
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
        } catch(err) {
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
              ${l.is_public ? `<div class="badge badge-success" style="font-size:0.7rem;">פורסם לקהילה</div>` : ''}
            </div>
            <div style="display:flex; gap:0.5rem; align-items:center;">
              ${!l.is_public ? `<button class="share-lecture-btn btn btn-outline btn-sm" data-id="${l.id}">שתף לקהילה</button>` : ''}
              <button class="download-lecture-btn btn btn-ghost" data-id="${l.id}" title="הורד PDF" style="color:var(--text); padding:0.25rem 0.5rem; font-size:1.2rem;">📥</button>
              <button class="view-summary-btn btn btn-ghost" title="הצג סיכום" style="color:var(--primary); padding:0.25rem 0.5rem; font-size:1.2rem;">📖</button>
              <button class="delete-lecture-btn btn btn-ghost" data-id="${l.id}" data-name="${escapeHtml(l.title)}" title="מחק הרצאה" style="color:var(--danger); padding:0.25rem 0.5rem; font-size:1.2rem;">🗑️</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /* ═════════════════════════════════════════════════════
     VIEW 3: Community
     ═════════════════════════════════════════════════════ */
  async function renderCommunity() {
    const params = new URLSearchParams({
      university: currentUser.university,
      year: currentUser.year,
      semester: currentUser.semester
    });

    const [lectures, leaderboard] = await Promise.all([
      api(`/community/lectures?${params.toString()}`),
      api(`/leaderboard?${params.toString()}`)
    ]);

    $app.innerHTML = `
      <div class="page-header" style="text-align:center; display:flex; flex-direction:column; align-items:center;">
        <h1 style="font-size:1.8rem;">קהילת הלמידה שלך</h1>
        <p style="color:var(--text-secondary); margin-top:0.5rem;">${escapeHtml(currentUser.university)} · ${escapeHtml(currentUser.degree || 'תואר כללי')} · שנה ${currentUser.year} · סמסטר ${currentUser.semester}</p>
      </div>

      <div style="display:flex; gap:2rem; flex-wrap:wrap; margin-top:2rem;">
        
        <!-- Shared Summaries -->
        <div style="flex:1; min-width:300px;">
          <h2 style="margin-bottom:1rem; border-bottom:1px solid var(--border); padding-bottom:0.5rem;">📚 סיכומים ציבוריים</h2>
          ${lectures.length === 0 ? '<div class="empty-state">אין סיכומים שותפו עדיין.</div>' : (() => {
            const groupedLectures = {};
            lectures.forEach(l => {
              const cName = l.course_name || 'כללי';
              if (!groupedLectures[cName]) groupedLectures[cName] = [];
              groupedLectures[cName].push(l);
            });

            return Object.entries(groupedLectures).map(([courseName, courseLectures]) => `
              <details class="card course-folder" style="margin-bottom:1rem; cursor:pointer;">
                <summary style="padding:1rem; font-weight:bold; font-size:1.2rem; outline:none; display:flex; align-items:center; gap:0.5rem; list-style:none;">
                  📁 ${escapeHtml(courseName)} <span class="badge badge-primary" style="margin-right:auto;">${courseLectures.length} סיכומים</span>
                </summary>
                <div style="padding:0 1rem 1rem 1rem;">
                  ${courseLectures.map(l => `
                    <div class="card lecture-item" style="padding:1rem; margin-top:1rem; border-right:3px solid var(--primary); background: var(--background);">
                      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                          <div class="lecture-title" style="font-size:1.1rem; font-weight:600;">${escapeHtml(l.title)}</div>
                          <div class="lecture-meta" style="color:var(--text-secondary); font-size:0.9rem;">
                            פורסם ע"י: ${escapeHtml(l.author_name)}
                          </div>
                        </div>
                        <div style="text-align:center;">
                          <button class="btn btn-ghost btn-like" data-id="${l.id}" style="font-size:1.2rem; padding:0.25rem;">👍</button>
                          <div style="font-size:0.8rem; font-weight:bold;">${l.likes} לייקים</div>
                        </div>
                      </div>
                      <div style="margin-top:1rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
                        <button class="btn btn-outline btn-sm comm-view-summary-btn" data-id="${l.id}">📖 קרא סיכום</button>
                        <button class="btn btn-outline btn-sm comm-download-btn" data-id="${l.id}" title="הורד PDF">📥 PDF</button>
                        <button class="btn btn-outline btn-sm comm-clone-btn" data-id="${l.id}" title="שכפל לחשבון שלי">📋 שכפל</button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </details>
            `).join('');
          })()}
        </div>


        <!-- Leaderboard -->
        <div style="flex:1; min-width:300px;">
          <h2 style="margin-bottom:1rem; border-bottom:1px solid var(--border); padding-bottom:0.5rem;">🏆 טבלת אלופים</h2>
          <div class="card" style="padding: 0;">
            <table style="width: 100%; border-collapse: collapse; text-align: right;">
              <thead>
                <tr style="background: var(--surface); border-bottom: 1px solid var(--border);">
                  <th style="padding: 0.8rem; font-weight: 600;">מקום</th>
                  <th style="padding: 0.8rem; font-weight: 600;">סטודנט</th>
                  <th style="padding: 0.8rem; font-weight: 600;">רמה</th>
                  <th style="padding: 0.8rem; font-weight: 600;">XP</th>
                </tr>
              </thead>
              <tbody>
                ${leaderboard.length === 0 ? '<tr><td colspan="4" style="padding: 1rem; text-align: center;">טרם דורגו סטודנטים</td></tr>' : ''}
                ${leaderboard.map((user, idx) => {
                  const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1);
                  const isMe = user.id === currentUser.id;
                  return `
                    <tr style="border-bottom: 1px solid var(--border); ${isMe ? 'background: rgba(59, 130, 246, 0.1); font-weight: bold;' : ''}">
                      <td style="padding: 0.8rem; font-size: 1.2rem;">${medal}</td>
                      <td style="padding: 0.8rem;">
                        <div style="font-weight: 600;">${escapeHtml(user.leaderboard_name || user.username)}</div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary);">🔥 ${user.current_streak} · ⭐ ${user.reputation}</div>
                      </td>
                      <td style="padding: 0.8rem;">${user.level}</td>
                      <td style="padding: 0.8rem; color: var(--primary); font-weight: bold;">${user.xp}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    $app.querySelectorAll('.comm-view-summary-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        const lect = lectures.find(x => x.id === id);
        if (lect) showSummaryModal(lect.summary_content);
      });
    });

    $app.querySelectorAll('.comm-download-btn, .download-lecture-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const id = parseInt(btn.dataset.id, 10);
          const response = await fetch('/api/lectures/' + id + '/download', {
            headers: { 'Authorization': 'Bearer ' + currentUser.token }
          });
          if (!response.ok) {
             const errorData = await response.json().catch(() => ({}));
             throw new Error(errorData.error || 'Failed to download PDF');
          }
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          const lect = lectures.find(x => x.id === id) || { title: 'lecture' };
          a.download = lect.title + '.pdf';
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
        } catch(e) {
          toast(e.message, 'error');
        }
      });
    });

    $app.querySelectorAll('.comm-clone-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          btn.disabled = true;
          const id = parseInt(btn.dataset.id, 10);
          await api('/lectures/' + id + '/clone', { method: 'POST' });
          toast('ההרצאה שוכפלה בהצלחה!', 'success');
          btn.textContent = '✅ שוכפל';
        } catch(e) {
          toast(e.message, 'error');
          btn.disabled = false;
        }
      });
    });

    $app.querySelectorAll('.btn-like').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/lectures/${btn.dataset.id}/like`, { method: 'POST' });
          toast('סימנת לייק!', 'success');
          renderCommunity();
        } catch(e) {
          toast(e.message, 'error');
        }
      });
    });

    document.getElementById('btn-add-event')?.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-content" style="text-align:right;">
          <h2>📅 הוסף אירוע חדש</h2>
          <div class="form-group">
            <label>כותרת (למשל: מועד א' באלגברה)</label>
            <input class="input" id="event-title" type="text" autofocus>
          </div>
          <div class="form-group">
            <label>תאריך</label>
            <input class="input" id="event-date" type="date">
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" id="modal-cancel-event">ביטול</button>
            <button class="btn btn-primary" id="modal-save-event">שמור</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      document.getElementById('modal-cancel-event').addEventListener('click', () => overlay.remove());
      document.getElementById('modal-save-event').addEventListener('click', async () => {
        const title = document.getElementById('event-title').value.trim();
        const date = document.getElementById('event-date').value;
        if(!title || !date) return toast('חובה למלא כותרת ותאריך', 'error');

        try {
          document.getElementById('modal-save-event').disabled = true;
          await api('/calendar', {
            method: 'POST',
            body: JSON.stringify({
              university: currentUser.university,
              year: currentUser.year,
              semester: currentUser.semester,
              title,
              event_date: date,
              created_by_user_id: currentUser.id
            })
          });
          overlay.remove();
          toast('אירוע נוצר!', 'success');
          renderCommunity();
        } catch(err) {
          toast(err.message, 'error');
          document.getElementById('modal-save-event').disabled = false;
        }
      });
    });
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
          headers: { 'Authorization': 'Bearer ' + currentUser.token },
          body: uploadFormData,
        }).then(r => r.json()),
        api(`/courses/${courseId}/due`)
      ]);

      if (uploadResult.error) throw new Error(uploadResult.error);

      if (uploadResult.user) {
        const oldToken = currentUser.token;
        currentUser = uploadResult.user;
        currentUser.token = oldToken;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        updateNav();
      }

      const summary = uploadResult.lecture.summary_content;
      const newFlashcards = uploadResult.new_flashcards.slice(0, 15);

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
  function runSM2Reviews(courseId, dueכרטיסיות, container, isCramMode = false) {
    return new Promise((resolve) => {
      let currentIndex = 0;
      const totalכרטיסיות = dueכרטיסיות.length;

      function renderCurrentCard() {
        if (currentIndex >= totalכרטיסיות) {
          resolve(); // Finished reviews
          return;
        }

        const card = dueכרטיסיות[currentIndex];
        let distractors = [];
        try {
          distractors = typeof card.distractors === 'string' ? JSON.parse(card.distractors) : (card.distractors || []);
        } catch(e) {}
        if (!Array.isArray(distractors)) distractors = [];

        const isMCQ = distractors.length > 0;
        const options = isMCQ ? shuffleArray([card.correct_answer, ...distractors]) : [];
        const keys = ['A', 'B', 'C', 'D'];

        container.innerHTML = `
          <div class="state-banner state-banner-review">
            <div class="state-icon">${isCramMode ? '🔥' : '🔒'}</div>
            <div class="state-info">
              <h3>${isCramMode ? 'מצב חרישה' : 'שלב 1: חזרה על הרצאות קודמות'}</h3>
              <p>${isCramMode ? `ענה על ${totalכרטיסיות - currentIndex} שאלות.` : `ענה על ${totalכרטיסיות - currentIndex} שאלות לפני למידת חומר חדש.`}</p>
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
              <span>📖 ${escapeHtml(card.lecture_title || 'הרצאה')}</span>
              ${card.lecture_summary ? `<button class="btn btn-ghost btn-sm btn-show-summary" style="padding:0.2rem 0.5rem;">הצג סיכום</button>` : ''}
            </div>
            <div class="question-text markdown-body" dir="auto" style="margin-bottom: 1.5rem;">${renderMarkdown(card.question_text)}</div>
            
            <ul class="options-list">
              ${options.map((opt, i) => `
                <li>
                  <button class="option-btn" data-answer="${escapeHtml(opt)}" data-correct="${opt === card.correct_answer}">
                    <span class="option-key">${keys[i]}</span>
                    <span class="option-content markdown-body" dir="auto">${renderMarkdown(opt)}</span>
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
          btn.addEventListener('click', () => handleAnswer(card, btn, container, true));
        });
      }

      async function handleAnswer(card, selectedBtn, container, isMCQ, manualQuality = null) {
        const allBtns = container.querySelectorAll('.option-btn');
        allBtns.forEach((b) => b.classList.add('disabled'));

        const isCorrect = selectedBtn.dataset.correct === 'true';
        const quality = isCorrect ? 1 : 0;

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
                : `<strong>לא נכון.</strong> התשובה הנכונה היא: <div class="markdown-body" style="display:inline-block; vertical-align:top;">${renderMarkdown(card.correct_answer)}</div>`
              }
            </div>
          </div>
          <div style="text-align:right; margin-top:1rem;">
            <button class="btn btn-primary" id="btn-next-card">
              ${currentIndex + 1 < totalכרטיסיות ? 'שאלה הבאה →' : (isCramMode ? 'סיים חרישה ✓' : 'המשך לסיכום →')}
            </button>
          </div>
        `;

        try {
          if (card.id) {
            const res = await api(`/flashcards/${card.id}/review`, {
              method: 'POST',
              body: JSON.stringify({ quality, user_id: currentUser ? currentUser.id : null, is_cram_mode: isCramMode }),
            });
            if (res && res.user) {
              const oldToken = currentUser.token;
              currentUser = res.user;
              currentUser.token = oldToken;
              localStorage.setItem('currentUser', JSON.stringify(currentUser));
              updateNav();
            }
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
          <div class="summary-text markdown-body" style="font-size: 1.1rem; line-height: 1.7;" dir="auto">${renderMarkdown(summaryText)}</div>
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
        let distractors = [];
        try {
          distractors = typeof card.distractors === 'string' ? JSON.parse(card.distractors) : (card.distractors || []);
        } catch(e) {}
        if (!Array.isArray(distractors)) distractors = [];

        const isMCQ = distractors.length > 0;
        const options = isMCQ ? shuffleArray([card.correct_answer, ...distractors]) : [];
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
            <div class="question-text markdown-body" dir="auto" style="margin-bottom: 1.5rem;">${renderMarkdown(card.question_text)}</div>
            
            <ul class="options-list">
              ${options.map((opt, i) => `
                <li>
                  <button class="option-btn" data-answer="${escapeHtml(opt)}" data-correct="${opt === card.correct_answer}">
                    <span class="option-key">${keys[i]}</span>
                    <span class="option-content markdown-body" dir="auto">${renderMarkdown(opt)}</span>
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
          btn.addEventListener('click', () => handleAnswer(card, btn, container, true));
        });
      }

      async function handleAnswer(card, selectedBtn, container, isMCQ, manualQuality = null) {
        const allBtns = container.querySelectorAll('.option-btn');
        allBtns.forEach((b) => b.classList.add('disabled'));

        const isCorrect = selectedBtn.dataset.correct === 'true';
        const quality = isCorrect ? 1 : 0;

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
                ? '<strong>כל הכבוד!</strong> התשובה נכונה.'
                : `<strong>לא נורא, נלמד את זה.</strong> התשובה הנכונה מופיעה למעלה.`
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
            const res = await api(`/flashcards/${card.id}/review`, {
              method: 'POST',
              body: JSON.stringify({ quality, user_id: currentUser ? currentUser.id : null }),
            });
            if (res && res.user) {
              const oldToken = currentUser.token;
              currentUser = res.user;
              currentUser.token = oldToken;
              localStorage.setItem('currentUser', JSON.stringify(currentUser));
              updateNav();
            }
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

    function validatePageRange(rangeStr, maxPages) {
      if (!rangeStr) return true;
      const parts = rangeStr.split(',');
      for (const part of parts) {
        const range = part.trim().split('-');
        if (range.length === 1) {
          const num = parseInt(range[0], 10);
          if (isNaN(num) || num < 1 || num > maxPages) return false;
        } else if (range.length === 2) {
          const start = parseInt(range[0], 10);
          const end = parseInt(range[1], 10);
          if (isNaN(start) || isNaN(end) || start < 1 || end > maxPages || start > end) return false;
        } else {
          return false;
        }
      }
      return true;
    }

    async function handleFile(file) {
      selectedFile = file;
      if (!titleInput.value.trim()) {
        titleInput.value = file.name.replace(/\.[^/.]+$/, "");
      }
      fileDisplay.style.display = 'block';
      fileDisplay.innerHTML = `📎 <strong>${escapeHtml(file.name)}</strong> (${(file.size / 1024).toFixed(0)} KB) <span class="spinner" style="display:inline-block;width:12px;height:12px;border-width:2px;margin-right:8px;"></span>`;
      zone.style.borderColor = 'var(--success)';
      zone.style.background = 'rgba(16,185,129,0.04)';
      
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
        const pageCount = pdfDoc.getPageCount();
        pagesInput.placeholder = `למשל: 1-${pageCount}`;
        pagesInput.dataset.maxPages = pageCount;
        fileDisplay.innerHTML = `📎 <strong>${escapeHtml(file.name)}</strong> (${(file.size / 1024).toFixed(0)} KB) - ${pageCount} עמודים`;
      } catch (err) {
        console.error("Failed to parse PDF pages", err);
        fileDisplay.innerHTML = `📎 <strong>${escapeHtml(file.name)}</strong> (${(file.size / 1024).toFixed(0)} KB)`;
      }
      checkReady();
    }

    zone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        handleFile(fileInput.files[0]);
      }
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
        handleFile(file);
      } else {
        toast('מתקבלים קבצי PDF בלבד', 'error');
      }
    });

    uploadBtn.addEventListener('click', async () => {
      if (!selectedFile || !titleInput.value.trim()) return;
      if (pagesInput && pagesInput.value.trim() && pagesInput.dataset.maxPages) {
        const maxPages = parseInt(pagesInput.dataset.maxPages, 10);
        if (!validatePageRange(pagesInput.value.trim(), maxPages)) {
          return toast(`טווח העמודים אינו תקין. הקובץ מכיל ${maxPages} עמודים.`, 'error');
        }
      }

      const share = await confirmModal("האם ברצונך לשתף סיכום זה עם הקהילה?\n(הסיכום יוצג תחת 'קהילה' רק לסטודנטים במסלול שלך)");

      const formData = new FormData();
      formData.append('title', titleInput.value.trim());
      if (pagesInput && pagesInput.value.trim()) {
        formData.append('pageRange', pagesInput.value.trim());
      }
      formData.append('pdf', selectedFile);
      formData.append('author_user_id', currentUser.id);
      if (share) {
        formData.append('is_public', '1');
      }
      startLearningSequence(courseId, formData);
    });
  }
})();
