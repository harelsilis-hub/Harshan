const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { queryAll, queryOne, execute } = require('../db/schema');
const axios = require('axios');

/* ── Multer config ─────────────────────────────────────── */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'), false);
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

/* ── GET lectures ──────────────────────────────────────── */
router.get('/courses/:courseId/lectures', (req, res) => {
  const lectures = queryAll(`
    SELECT l.*,
      (SELECT COUNT(*) FROM flashcards WHERE lecture_id = l.id) AS flashcard_count
    FROM lectures l
    WHERE l.course_id = ?
    ORDER BY l.created_at DESC
  `, [req.params.courseId]);
  res.json(lectures);
});

/* ── GET latest lecture (micro-summary) ────────────────── */
router.get('/courses/:courseId/lectures/latest', (req, res) => {
  const lecture = queryOne(`
    SELECT * FROM lectures
    WHERE course_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [req.params.courseId]);
  res.json(lecture || null);
});

function parsePageRange(rangeStr) {
  if (!rangeStr) return null;
  const pages = new Set();
  const parts = rangeStr.split(',');
  for (let part of parts) {
    part = part.trim();
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(n => parseInt(n.trim(), 10));
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let i = start; i <= end; i++) pages.add(i);
      }
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num)) pages.add(num);
    }
  }
  return pages.size > 0 ? pages : null;
}

/* ── POST upload lecture + generate flashcards ─────────── */
router.post('/courses/:courseId/lectures', upload.single('pdf'), async (req, res) => {
  try {
    const { courseId } = req.params;
    const { title, pageRange, author_user_id } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Lecture title is required' });
    }

    /* ── Extract text ─────────────────────────────────── */
    let textContent = '';

    if (req.file) {
      const pdfParse = require('pdf-parse');
      const buf = fs.readFileSync(req.file.path);
      
      const targetPages = parsePageRange(pageRange);
      let options = {};
      
      if (targetPages) {
        options.pagerender = function(pageData) {
          if (!targetPages.has(pageData.pageIndex + 1)) {
            return '';
          }
          return pageData.getTextContent().then(function(textContent) {
              let lastY, text = '';
              for (let item of textContent.items) {
                  if (lastY == item.transform[5] || !lastY){
                      text += item.str;
                  } else {
                      text += '\n' + item.str;
                  }    
                  lastY = item.transform[5];
              }
              return text;
          });
        };
      }
      
      const pdfData = await pdfParse(buf, options);
      textContent = pdfData.text;
    } else {
      textContent = req.body.content || '';
    }

    if (!textContent.trim()) {
      return res.status(400).json({ error: 'No content could be extracted from the PDF.' });
    }

    /* ── Generate summary and flashcards (Gemini API) ───────────────────── */
    let flashcards = [];
    let summary = '';
    try {
      const response = await axios.post(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=AQ.Ab8RN6JFY07YNeS8_hDWiPvr-yvtJtpMyxCxUjMceiEq8nSz-Q',
        {
          systemInstruction: {
            parts: [{ text: 'You are an expert educational AI. Extract key concepts from the text. Respond ONLY with a valid JSON object. The object must have a "summary" (string, a comprehensive, highly detailed summary covering all crucial sections, concepts, and formulas of the lecture, formatted nicely with bullet points and paragraphs where appropriate) and "flashcards" (array of objects). Each flashcard object must have: "question_text" (string), "correct_answer" (string), and "distractors" (array of 3 strings). ALL CONTENT MUST BE IN HEBREW. CRITICAL: Any mathematical formula, operator, inequality, English variable, or inner product MUST be formatted strictly in LaTeX enclosed in single dollar signs (e.g., $A*A = I$). Do not use plain text for math. EXTREMELY IMPORTANT: Because you are responding in JSON, you MUST double-escape all backslashes in your LaTeX strings (e.g., use \\\\langle instead of \\langle, and \\\\ge instead of \\ge) so that JSON.parse() does not crash!' }]
          },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: textContent.substring(0, 200000)
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      let aiContent = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof aiContent === 'string') {
        aiContent = aiContent.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
        const parsed = JSON.parse(aiContent);
        summary = parsed.summary || 'Summary could not be generated.';
        flashcards = parsed.flashcards || [];
      } else {
        throw new Error('Unexpected AI response format');
      }
    } catch (apiErr) {
      console.error('Gemini API error:', apiErr.response?.data || apiErr.message);
      return res.status(500).json({ error: 'Failed to generate flashcards via Gemini API.' });
    }

    /* ── Save lecture ──────────────────────────────────── */
    const isPublicInt = req.body.is_public === '1' ? 1 : 0;
    const { lastId: lectureId } = execute(
      'INSERT INTO lectures (course_id, title, summary_content, author_user_id, is_public) VALUES (?, ?, ?, ?, ?)',
      [courseId, title.trim(), summary, author_user_id ? parseInt(author_user_id, 10) : null, isPublicInt]
    );

    /* ── Save flashcards (Due tomorrow) ────────────────── */
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextStr = tomorrow.toISOString().replace('T', ' ').substring(0, 19);

    for (const c of flashcards) {
      const { lastId: cardId } = execute(
        `INSERT INTO flashcards (course_id, lecture_id, question_text, correct_answer, distractors, next_review_date, author_user_id, is_public)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [courseId, lectureId, c.question_text, c.correct_answer, JSON.stringify(c.distractors), nextStr, author_user_id ? parseInt(author_user_id, 10) : null, isPublicInt]
      );
      c.id = cardId; // Attach the ID so frontend can potentially update it if it wants
      c.lecture_title = title.trim(); // Add lecture title for the frontend quiz UI
      c.lecture_summary = summary; // Add lecture summary so the frontend can show it during the quiz
    }

    const lecture = queryOne('SELECT * FROM lectures WHERE id = ?', [lectureId]);

    let updatedUser = null;
    if (author_user_id) {
      const uId = parseInt(author_user_id, 10);
      const user = queryOne('SELECT * FROM users WHERE id = ?', [uId]);
      if (user) {
        let { xp, level } = user;
        xp += 50;
        level = Math.floor(Math.sqrt(xp / 50)) + 1;
        execute('UPDATE users SET xp = ?, level = ? WHERE id = ?', [xp, level, uId]);
        updatedUser = queryOne('SELECT * FROM users WHERE id = ?', [uId]);
      }
    }

    res.status(201).json({ lecture, flashcards_generated: flashcards.length, new_flashcards: flashcards, user: updatedUser });
  } catch (err) {
    console.error('Lecture upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── DELETE lecture ──────────────────────────────────────── */
router.delete('/lectures/:id', (req, res) => {
  execute('DELETE FROM flashcards WHERE lecture_id = ?', [req.params.id]);
  const { changes } = execute('DELETE FROM lectures WHERE id = ?', [req.params.id]);
  if (changes === 0) {
    return res.status(404).json({ error: 'Lecture not found' });
  }
  res.json({ success: true });
});

/* ── GET community lectures ──────────────────────────────────────── */
router.get('/community/lectures', (req, res) => {
  const { university, year, semester } = req.query;
  if (!university || !year || !semester) {
    return res.status(400).json({ error: 'Cohort info required' });
  }

  const lectures = queryAll(`
    SELECT l.*, c.name AS course_name, u.username AS author_name,
      (SELECT COUNT(*) FROM flashcards WHERE lecture_id = l.id) AS flashcard_count
    FROM lectures l
    JOIN users u ON l.author_user_id = u.id
    JOIN courses c ON l.course_id = c.id
    WHERE l.is_public = 1 
      AND u.university = ? 
      AND u.year = ? 
      AND u.semester = ?
    ORDER BY l.likes DESC, l.created_at DESC
  `, [university, parseInt(year, 10), parseInt(semester, 10)]);

  res.json(lectures);
});

/* ── POST share lecture ──────────────────────────────────── */
router.post('/lectures/:id/share', (req, res) => {
  const { is_public } = req.body;
  const { changes } = execute('UPDATE lectures SET is_public = ? WHERE id = ?', [is_public ? 1 : 0, req.params.id]);
  if (changes === 0) return res.status(404).json({ error: 'Lecture not found' });
  
  execute('UPDATE flashcards SET is_public = ? WHERE lecture_id = ?', [is_public ? 1 : 0, req.params.id]);
  
  res.json({ success: true, is_public: !!is_public });
});

/* ── POST like lecture ───────────────────────────────────── */
router.post('/lectures/:id/like', (req, res) => {
  const lecture = queryOne('SELECT * FROM lectures WHERE id = ?', [req.params.id]);
  if (!lecture) return res.status(404).json({ error: 'Lecture not found' });
  
  execute('UPDATE lectures SET likes = likes + 1 WHERE id = ?', [req.params.id]);
  
  if (lecture.author_user_id) {
    execute('UPDATE users SET reputation = reputation + 10 WHERE id = ?', [lecture.author_user_id]);
  }
  
  res.json({ success: true });
});

module.exports = router;
