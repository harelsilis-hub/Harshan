const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { queryAll, queryOne, execute, runTransaction } = require('../db/schema');
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

    /* ── Chunk text for LLM ───────────────────────────────────── */
    let textChunks = [];
    if (textContent.length > 0) {
      const CHUNK_SIZE = 15000;
      for (let i = 0; i < textContent.length; i += CHUNK_SIZE) {
        textChunks.push(textContent.substring(i, i + CHUNK_SIZE));
      }
    }

    /* ── Generate summary and flashcards (Gemini API) ───────────────────── */
    let flashcards = [];
    let summaryParts = [];

    const callGeminiWithRetry = async (chunkText, attempt = 1) => {
      try {
        const response = await axios.post(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=AQ.Ab8RN6JFY07YNeS8_hDWiPvr-yvtJtpMyxCxUjMceiEq8nSz-Q',
          {
            systemInstruction: {
              parts: [{ text: `Act as a meticulous Academic Data Extractor for a Spaced Repetition System.
Your task is to exhaustively process the provided academic text and extract EVERY SINGLE concept, definition, theorem, lemma, corollary, and significant exercise into individual flashcards.

ABSOLUTE RULES:
1. ZERO SUMMARIZATION: Do not compress the text. If the document contains 15 definitions and 10 theorems, you MUST output at least 25 flashcards.
2. EXHAUSTIVE PARSING: Comb through the text paragraph by paragraph. You must extract anything explicitly labeled as "הגדרה" (Definition), "משפט" (Theorem), "טענה" (Claim), "מסקנה" (Corollary), or "דוגמה" (Example).
3. MATH FORMATTING (CRITICAL): Every mathematical symbol, equation, operator, matrix, or English variable MUST be written in strict LaTeX wrapped in single dollar signs (e.g., $A^* A = I$, $\\langle v, w \\rangle \\ge 0$). Never use plain text for math. EXTREMELY IMPORTANT: Because you are responding in JSON, you MUST double-escape all backslashes in your LaTeX strings (e.g., use \\\\\\\\langle instead of \\\\langle, and \\\\\\\\ge instead of \\\\ge) so that JSON.parse() does not crash!
4. LANGUAGE: The flashcard content (front and back) must be entirely in Hebrew, exactly preserving the academic terminology used in the source text.
5. CHRONOLOGICAL ORDER: Assign a strictly incremental appearance_index starting from 1 for each chunk, maintaining the exact order the concepts appeared in the text.

OUTPUT FORMAT:
Return ONLY a valid JSON object with the exact following structure. Do not include markdown formatting like \`\`\`json.

{
  "chunk_summary": "צור סיכום תמציתי ומדויק שמאגד אך ורק את כל ההגדרות, המשפטים, והטענות המרכזיות. סנן הסברים ארוכים, דוגמאות וטקסט מעבר, אבל אל תשמיט שום עובדה מתמטית או הגדרה. השתמש בפורמט LaTeX לנוסחאות.",
  "flashcards": [
    {
      "front": "Question or concept identifier (e.g., 'מהי ההגדרה של אופרטור נורמלי?')",
      "back": "Full and exact definition/theorem statement with LaTeX",
      "appearance_index": 1
    }
  ]
}` }]
            },
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `Source Text to Process:\n${chunkText}`
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
            },
            timeout: 60000
          }
        );

        let aiContent = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof aiContent === 'string') {
          aiContent = aiContent.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
          return JSON.parse(aiContent);
        } else {
          throw new Error('Unexpected AI response format');
        }
      } catch (err) {
        if (attempt >= 3) throw err;
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, delay));
        return callGeminiWithRetry(chunkText, attempt + 1);
      }
    };

    try {
      const chunkResults = await Promise.all(textChunks.map(chunk => callGeminiWithRetry(chunk)));
      for (const res of chunkResults) {
        if (res && res.chunk_summary) {
          summaryParts.push(res.chunk_summary);
        }
        if (Array.isArray(res)) {
          flashcards = flashcards.concat(res);
        } else if (res && res.flashcards) {
          flashcards = flashcards.concat(res.flashcards);
        }
      }
    } catch (apiErr) {
      console.error('Gemini API error after retries:', apiErr.message);
      return res.status(500).json({ error: 'Failed to generate flashcards via Gemini API after multiple retries.' });
    }
    const summary = summaryParts.join('\\n\\n') || 'מצב חילוץ מקיף: סיכום ההרצאה אינו זמין בתצורה זו.';

    /* ── Save lecture and flashcards (Atomic Transaction) ──────────────── */
    const isPublicInt = req.body.is_public === '1' ? 1 : 0;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextStr = tomorrow.toISOString().replace('T', ' ').substring(0, 19);

    let lectureId;
    let updatedUser = null;

    runTransaction(() => {
      const resLec = execute(
        'INSERT INTO lectures (course_id, title, summary_content, author_user_id, is_public) VALUES (?, ?, ?, ?, ?)',
        [courseId, title.trim(), summary, author_user_id ? parseInt(author_user_id, 10) : null, isPublicInt]
      );
      lectureId = resLec.lastId;

      for (let i = 0; i < flashcards.length; i++) {
        const c = flashcards[i];
        const appearance_index = i + 1;
        const learning_status = 'pending';
        const resCard = execute(
          `INSERT INTO flashcards (course_id, lecture_id, appearance_index, learning_status, question_text, correct_answer, distractors, next_review_date, author_user_id, is_public)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [courseId, lectureId, appearance_index, learning_status, c.front || c.question_text || '', c.back || c.correct_answer || '', JSON.stringify(c.distractors || []), nextStr, author_user_id ? parseInt(author_user_id, 10) : null, isPublicInt]
        );
        c.id = resCard.lastId;
        c.appearance_index = appearance_index;
        c.learning_status = learning_status;
        c.lecture_title = title.trim();
        c.lecture_summary = summary;
      }

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
    });

    const lecture = queryOne('SELECT * FROM lectures WHERE id = ?', [lectureId]);

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
