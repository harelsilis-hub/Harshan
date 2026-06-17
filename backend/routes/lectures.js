const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { queryAll, queryOne, execute, runTransaction } = require('../db/schema');
const axios = require('axios');

/* ── Multer config ─────────────────────────────────────── */
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'), false);
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

/* ── GET lectures ──────────────────────────────────────── */
router.get('/courses/:courseId/lectures', async (req, res) => {
  const lectures = await queryAll(`
    SELECT l.*,
      (SELECT COUNT(*) FROM flashcards WHERE lecture_id = l.id) AS flashcard_count
    FROM lectures l
    WHERE l.course_id = ?
    ORDER BY l.created_at DESC
  `, [req.params.courseId]);
  res.json(lectures);
});

/* ── GET latest lecture (micro-summary) ────────────────── */
router.get('/courses/:courseId/lectures/latest', async (req, res) => {
  const lecture = await queryOne(`
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
      const buf = req.file.buffer;

      const targetPages = parsePageRange(pageRange);
      let options = {};

      if (targetPages) {
        options.pagerender = function (pageData) {
          if (!targetPages.has(pageData.pageIndex + 1)) {
            return '';
          }
          return pageData.getTextContent().then(function (textContent) {
            let lastY, text = '';
            for (let item of textContent.items) {
              if (lastY == item.transform[5] || !lastY) {
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
      const keys = [process.env.GEMINI_API_KEY1, process.env.GEMINI_API_KEY2, process.env.GEMINI_API_KEY].filter(Boolean);
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      try {
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${randomKey}`,
          {
            systemInstruction: {
              parts: [{
                text: `Act as a strict Mathematical Data Extractor. Your task is to extract concepts VERBATIM from the text into a summary block AND individual flashcards.

ABSOLUTE RULES:
1. EXHAUSTIVE EXTRACTION: You MUST extract EVERY single "הגדרה" (Definition), "משפט" (Theorem), "טענה" (Claim), "טענונת" (Minor Claim), and "מסקנה" (Corollary).
2. NO SUMMARIZATION: You must copy the text word-for-word exactly as it appears.
3. IGNORE PROOFS & EXAMPLES: Skip "הוכחה" and "דוגמה".
4. MATH FORMATTING: Write standard LaTeX without extra escaping (e.g., \\alpha, \\frac{}{}, \\langle v, w \\rangle). Wrap inline math in $ and block equations in $$.
5. HEBREW: Content must be in Hebrew.
6. MULTIPLE CHOICE: For every flashcard, generate exactly 3 plausible but incorrect distractors in the 'distractors' array.

OUTPUT FORMAT (Strict JSON):
Return ONLY a valid JSON object.

{
  "chunk_summary": "DO NOT SUMMARIZE. Extract each item verbatim in clear Markdown format. Use headers (e.g. ### הגדרה) or blockquotes for each item instead of technical tags like [START VERBATIM BLOCK].",
  "flashcards": [
    {
      "front": "Question identifying the concept (e.g., 'מהי ההגדרה של מר חב מכפלה פנימית?')",
      "back": "VERBATIM copy of the text with standard LaTeX math formatting.",
      "distractors": [
        "Plausible incorrect mathematical definition 1",
        "Plausible incorrect mathematical definition 2",
        "Plausible incorrect mathematical definition 3"
      ],
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
            timeout: 180000
          }
        );

        let aiContent = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof aiContent === 'string') {
          aiContent = aiContent.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
          try {
            return JSON.parse(aiContent);
          } catch (parseErr) {
            console.log('JSON parse failed, attempting to fix LaTeX escaping...', parseErr.message);

            // 1. Escape any single backslash that isn't followed by a valid JSON escape char
            // We use lookbehind (?<!\\) to ensure we don't match a backslash that is already escaped
            let fixed = aiContent.replace(/(?<!\\)\\(?!["\\/bfnrtu])/g, '\\\\');

            // 2. Escape \u if it is NOT followed by 4 hex digits (e.g. \underbrace)
            fixed = fixed.replace(/(?<!\\)\\u(?![0-9a-fA-F]{4})/g, '\\\\u');

            // 3. Escape common LaTeX macros that happen to start with valid JSON escape characters
            const latexWords = [
              'frac', 'forall', 'frown',
              'nabla', 'neq', 'nu', 'notin', 'nexists', 'nrightarrow', 'nsubseteq', 'nsupseteq', 'normal',
              'rightarrow', 'rho', 'rangle', 'right',
              'text', 'theta', 'times', 'triangle', 'tau', 'tilde', 'to', 'top',
              'begin', 'beta', 'bmod', 'bar', 'bigcup', 'bigcap', 'bot', 'bullet', 'bf', 'bb'
            ];
            for (const word of latexWords) {
              const regex = new RegExp(`(?<!\\\\)\\\\${word}`, 'g');
              fixed = fixed.replace(regex, `\\\\\\\\${word}`);
            }

            // 4. Sometimes LLMs output unescaped actual newlines (ASCII 10) inside string values
            // We can replace them with \n, but only inside quotes. This is complex, so let's skip for now
            // as the lookbehinds usually fix the primary math problems.

            return JSON.parse(fixed);
          }
        } else {
          throw new Error('Unexpected AI response format: ' + JSON.stringify(response.data));
        }
      } catch (err) {
        if (attempt >= 3) {
          console.error(`Gemini API failed on chunk (Attempt 3). Error details:`, err.response?.data || err.message);
          throw err;
        }
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
      console.error('Gemini API outer catch error:', apiErr.response?.data || apiErr.message);
      return res.status(500).json({ 
        error: 'Failed to generate flashcards via Gemini API after multiple retries.',
        details: apiErr.response?.data || apiErr.message
      });
    }
    const summary = summaryParts.join('\\n\\n') || 'מצב חילוץ מקיף: סיכום ההרצאה אינו זמין בתצורה זו.';

    /* ── Save lecture and flashcards (Atomic Transaction) ──────────────── */
    const isPublicInt = req.body.is_public === '1' ? 1 : 0;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextStr = tomorrow.toISOString().replace('T', ' ').substring(0, 19);

    let lectureId;
    let updatedUser = null;

    await runTransaction(async (tx) => {
      const resLec = await tx.execute(
        'INSERT INTO lectures (course_id, title, summary_content, author_user_id, is_public) VALUES (?, ?, ?, ?, ?)',
        [courseId, title.trim(), summary, author_user_id ? parseInt(author_user_id, 10) : null, isPublicInt]
      );
      lectureId = resLec.lastId;

      for (let i = 0; i < flashcards.length; i++) {
        const c = flashcards[i];
        const appearance_index = i + 1;
        const learning_status = 'pending';
        const resCard = await tx.execute(
          `INSERT INTO flashcards (course_id, lecture_id, appearance_index, learning_status, question_text, correct_answer, distractors, next_review_date, author_user_id, is_public)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [courseId, lectureId, appearance_index, learning_status, c.front || c.question_text || '', c.back || c.correct_answer || '', JSON.stringify(c.distractors || []), nextStr, author_user_id ? parseInt(author_user_id, 10) : null, isPublicInt]
        );
        c.id = resCard.lastId;
        c.question_text = c.front || c.question_text || '';
        c.correct_answer = c.back || c.correct_answer || '';
        c.appearance_index = appearance_index;
        c.learning_status = learning_status;
        c.lecture_title = title.trim();
        c.lecture_summary = summary;
      }

      if (author_user_id) {
        const uId = parseInt(author_user_id, 10);
        const user = await tx.queryOne('SELECT * FROM users WHERE id = ?', [uId]);
        if (user) {
          let { xp, level } = user;
          xp += 50;
          level = Math.floor(Math.sqrt(xp / 50)) + 1;
          await tx.execute('UPDATE users SET xp = ?, level = ? WHERE id = ?', [xp, level, uId]);
          updatedUser = await tx.queryOne('SELECT * FROM users WHERE id = ?', [uId]);
        }
      }
    });

    const lecture = await queryOne('SELECT * FROM lectures WHERE id = ?', [lectureId]);

    res.status(201).json({ lecture, flashcards_generated: flashcards.length, new_flashcards: flashcards, user: updatedUser });
  } catch (err) {
    console.error('Lecture upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── DELETE lecture ──────────────────────────────────────── */
router.delete('/lectures/:id', async (req, res) => {
  await execute('DELETE FROM flashcards WHERE lecture_id = ?', [req.params.id]);
  const { changes } = await execute('DELETE FROM lectures WHERE id = ?', [req.params.id]);
  if (changes === 0) {
    return res.status(404).json({ error: 'Lecture not found' });
  }
  res.json({ success: true });
});

/* ── GET community lectures ──────────────────────────────────────── */
router.get('/community/lectures', async (req, res) => {
  const { university, year, semester } = req.query;
  if (!university || !year || !semester) {
    return res.status(400).json({ error: 'Cohort info required' });
  }

  const lectures = await queryAll(`
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
router.post('/lectures/:id/share', async (req, res) => {
  const { is_public } = req.body;
  const { changes } = await execute('UPDATE lectures SET is_public = ? WHERE id = ?', [is_public ? 1 : 0, req.params.id]);
  if (changes === 0) return res.status(404).json({ error: 'Lecture not found' });

  await execute('UPDATE flashcards SET is_public = ? WHERE lecture_id = ?', [is_public ? 1 : 0, req.params.id]);

  res.json({ success: true, is_public: !!is_public });
});

/* ── POST like lecture ───────────────────────────────────── */
router.post('/lectures/:id/like', async (req, res) => {
  const lecture = await queryOne('SELECT * FROM lectures WHERE id = ?', [req.params.id]);
  if (!lecture) return res.status(404).json({ error: 'Lecture not found' });

  await execute('UPDATE lectures SET likes = likes + 1 WHERE id = ?', [req.params.id]);

  if (lecture.author_user_id) {
    await execute('UPDATE users SET reputation = reputation + 10 WHERE id = ?', [lecture.author_user_id]);
  }

  res.json({ success: true });
});

module.exports = router;
