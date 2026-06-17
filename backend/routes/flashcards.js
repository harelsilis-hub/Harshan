const express = require('express');
const router = express.Router();
const axios = require('axios');
const { queryAll, queryOne, execute } = require('../db/schema');
const authMiddleware = require('./authMiddleware');

router.use(authMiddleware);

// GET /api/courses/:courseId/due — due flashcards for a course
router.get('/courses/:courseId/due', async (req, res) => {
  const cards = await queryAll(`
    SELECT f.*, l.title AS lecture_title, l.summary_content AS lecture_summary
    FROM flashcards f
    JOIN lectures l ON f.lecture_id = l.id
    WHERE f.course_id = ?
      AND f.user_id = ?
      AND f.learning_status = 'active'
      AND f.next_review_date <= NOW()
    ORDER BY f.next_review_date ASC
  `, [req.params.courseId, req.user.id]);
  res.json(cards);
});

// POST /api/courses/:courseId/drip-feed — unlock N flashcards into active learning
router.post('/courses/:courseId/drip-feed', async (req, res) => {
  const limitParam = req.body.limit;
  let limit = 15;
  if (limitParam === 'ALL') {
    limit = 999999;
  } else if (limitParam !== undefined && !isNaN(parseInt(limitParam, 10))) {
    limit = parseInt(limitParam, 10);
  }

  const pendingCards = await queryAll(`
    SELECT id FROM flashcards
    WHERE course_id = ? AND learning_status = 'pending' AND user_id = ?
    ORDER BY appearance_index ASC
    LIMIT ?
  `, [req.params.courseId, req.user.id, limit]);

  if (pendingCards.length === 0) {
    return res.json({ unlocked: 0, cards: [] });
  }

  const ids = pendingCards.map(c => c.id);
  const placeholders = ids.map(() => '?').join(',');
  
  await execute(`
    UPDATE flashcards
    SET learning_status = 'active', next_review_date = NOW(), interval = 0, repetitions = 0
    WHERE id IN (${placeholders}) AND user_id = ?
  `, [...ids, req.user.id]);

  const unlockedCards = await queryAll(`
    SELECT f.*, l.title AS lecture_title, l.summary_content AS lecture_summary
    FROM flashcards f
    JOIN lectures l ON f.lecture_id = l.id
    WHERE f.id IN (${placeholders})
    ORDER BY f.appearance_index ASC
  `, ids);

  res.json({ unlocked: unlockedCards.length, cards: unlockedCards });
});

// GET /api/courses/:courseId/flashcards — all flashcards (for stats)
router.get('/courses/:courseId/flashcards', async (req, res) => {
  const cards = await queryAll(`
    SELECT f.*, l.title AS lecture_title, l.summary_content AS lecture_summary
    FROM flashcards f
    JOIN lectures l ON f.lecture_id = l.id
    WHERE f.course_id = ? AND f.user_id = ?
    ORDER BY f.next_review_date ASC
  `, [req.params.courseId, req.user.id]);
  res.json(cards);
});

// GET /api/courses/:courseId/cram — Ghost Review Engine (Hardest 50 Active Cards)
router.get('/courses/:courseId/cram', async (req, res) => {
  const cards = await queryAll(`
    SELECT f.*, l.title AS lecture_title, l.summary_content AS lecture_summary
    FROM flashcards f
    JOIN lectures l ON f.lecture_id = l.id
    WHERE f.course_id = ? AND f.user_id = ?
      AND f.learning_status IN ('active', 'pending')
    ORDER BY f.easiness_factor ASC
    LIMIT 50
  `, [req.params.courseId, req.user.id]);
  res.json(cards);
});

// POST /api/courses/:courseId/cram-generate — Dynamically generate 10 ephemeral questions
router.post('/courses/:courseId/cram-generate', async (req, res) => {
  try {
    const courseId = req.params.courseId;
    
    // Fetch up to 3 lecture summaries for context
    const lectures = await queryAll(`
      SELECT summary_content FROM lectures
      WHERE course_id = ? AND user_id = ? AND summary_content IS NOT NULL
      ORDER BY RANDOM() LIMIT 3
    `, [courseId, req.user.id]);

    if (lectures.length === 0) {
      return res.json([]);
    }

    const combinedSummary = lectures.map(l => l.summary_content).join('\n\n--- NEXT LECTURE ---\n\n');

    const promptText = `
Act as a strict Mathematical Quiz Generator. 
Based on the following course material, generate exactly 10 unique, challenging Multiple Choice Questions (MCQs) for a student to study in "Cram Mode".
Do NOT just repeat definitions verbatim. Ask conceptual questions, or ask the student to identify the correct condition for a theorem, etc.

ABSOLUTE RULES:
1. MATH FORMATTING: Write standard LaTeX without extra escaping (e.g., \\alpha, \\frac{}{}, \\langle v, w \\rangle). Wrap inline math in $ and block equations in $$.
2. HEBREW: Content must be in Hebrew.
3. DISTRACTORS: For every question, generate exactly 3 mathematically plausible but incorrect distractors.

OUTPUT FORMAT (Strict JSON):
Return ONLY a valid JSON array of objects.
[
  {
    "question_text": "Question text here",
    "correct_answer": "The correct answer",
    "distractors": ["Wrong 1", "Wrong 2", "Wrong 3"]
  }
]

Source Material:
${combinedSummary}
`;

    const keys = [process.env.GEMINI_API_KEY1, process.env.GEMINI_API_KEY2, process.env.GEMINI_API_KEY].filter(Boolean);
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${randomKey}`,
      {
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
        }
      }
    );

    let resultText = response.data.candidates[0].content.parts[0].text;
    resultText = resultText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    
    let generatedCards;
    try {
      generatedCards = JSON.parse(resultText);
    } catch (parseErr) {
      console.log('JSON parse failed in Cram mode, attempting to fix LaTeX escaping...', parseErr.message);
      let fixed = resultText.replace(/(?<!\\)\\(?!["\\/bfnrtu])/g, '\\\\');
      fixed = fixed.replace(/(?<!\\)\\u(?![0-9a-fA-F]{4})/g, '\\\\u');
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
      generatedCards = JSON.parse(fixed);
    }
    
    const uiCards = generatedCards.map(c => ({
      id: null,
      course_id: courseId,
      question_text: c.question_text,
      correct_answer: c.correct_answer,
      distractors: JSON.stringify(c.distractors),
      learning_status: 'cram_ephemeral'
    }));

    res.json(uiCards);
  } catch (err) {
    console.error('Cram generation error details:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to generate cram questions.' });
  }
});

router.post('/flashcards/:id/review', async (req, res) => {
  const { quality, is_cram_mode } = req.body;
  const user_id = req.user.id;
  
  if (quality === undefined || quality < 0 || quality > 5) {
    return res.status(400).json({ error: 'Quality score must be between 0 and 5' });
  }

  const card = await queryOne('SELECT * FROM flashcards WHERE id = ? AND user_id = ?', [req.params.id, user_id]);
  if (!card) return res.status(404).json({ error: 'Flashcard not found' });

  /* ── SM-2 Algorithm ─────────────────────────────────── */
  let { easiness_factor, interval, repetitions } = card;
  const q = parseInt(quality, 10);

  if (q >= 1) {
    // Successful recall
    if (repetitions === 0)      interval = 1;
    else if (repetitions === 1) interval = 6;
    else                        interval = Math.round(interval * easiness_factor);
    repetitions += 1;
    easiness_factor += 0.1;
  } else {
    // Failed recall — reset
    repetitions = 0;
    interval = 1;
    easiness_factor -= 0.2;
  }

  // Easiness factor update
  easiness_factor = Math.max(1.3, easiness_factor);

  // Next review date
  const next = new Date();
  next.setDate(next.getDate() + interval);
  const nextStr = next.toISOString().replace('T', ' ').substring(0, 19);
  /* ────────────────────────────────────────────────────── */

  if (!is_cram_mode) {
    await execute(`
      UPDATE flashcards
      SET easiness_factor = ?, interval = ?, repetitions = ?, next_review_date = ?, learning_status = 'active'
      WHERE id = ? AND user_id = ?
    `, [easiness_factor, interval, repetitions, nextStr, req.params.id, user_id]);
  } else {
    // In cram mode, we just mutate the in-memory object to reflect the "simulated" result 
    // for immediate UI feedback, without writing to the DB.
    card.easiness_factor = easiness_factor;
    card.interval = interval;
    card.repetitions = repetitions;
    card.next_review_date = nextStr;
  }

  let updatedUser = null;
  if (user_id) {
    const user = await queryOne('SELECT * FROM users WHERE id = ?', [user_id]);
    if (user) {
      const today = new Date().toISOString().split('T')[0];
      let { xp, level, current_streak, last_review_date, streak_freezes } = user;
      
      xp += 5;
      level = Math.floor(Math.sqrt(xp / 50)) + 1;

      if (last_review_date !== today) {
        if (!last_review_date) {
          current_streak = 1;
        } else {
          const lastDate = new Date(last_review_date);
          const currentDate = new Date(today);
          const diffDays = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));
          
          if (diffDays === 1) {
            current_streak += 1;
          } else if (diffDays > 1) {
            if (streak_freezes > 0) {
              streak_freezes -= 1;
              current_streak += 1;
            } else {
              current_streak = 1;
            }
          }
        }
        last_review_date = today;
      }
      
      await execute(`
        UPDATE users 
        SET xp = ?, level = ?, current_streak = ?, last_review_date = ?, streak_freezes = ?
        WHERE id = ?
      `, [xp, level, current_streak, last_review_date, streak_freezes, user_id]);
      
      updatedUser = await queryOne('SELECT * FROM users WHERE id = ?', [user_id]);
    }
  }

  const updated = is_cram_mode ? card : await queryOne('SELECT * FROM flashcards WHERE id = ?', [req.params.id]);
  res.json({ card: updated, user: updatedUser });
});

module.exports = router;
