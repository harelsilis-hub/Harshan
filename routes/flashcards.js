const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../db/schema');

// GET /api/courses/:courseId/due — due flashcards for a course
router.get('/courses/:courseId/due', (req, res) => {
  const cards = queryAll(`
    SELECT f.*, l.title AS lecture_title, l.summary_content AS lecture_summary
    FROM flashcards f
    JOIN lectures l ON f.lecture_id = l.id
    WHERE f.course_id = ?
      AND f.next_review_date <= datetime('now')
    ORDER BY f.next_review_date ASC
  `, [req.params.courseId]);
  res.json(cards);
});

// GET /api/courses/:courseId/flashcards — all flashcards (for stats)
router.get('/courses/:courseId/flashcards', (req, res) => {
  const cards = queryAll(`
    SELECT f.*, l.title AS lecture_title, l.summary_content AS lecture_summary
    FROM flashcards f
    JOIN lectures l ON f.lecture_id = l.id
    WHERE f.course_id = ?
    ORDER BY f.next_review_date ASC
  `, [req.params.courseId]);
  res.json(cards);
});

// POST /api/flashcards/:id/review — SM-2 mutation
router.post('/flashcards/:id/review', (req, res) => {
  const { quality } = req.body;
  if (quality === undefined || quality < 0 || quality > 5) {
    return res.status(400).json({ error: 'Quality score must be between 0 and 5' });
  }

  const card = queryOne('SELECT * FROM flashcards WHERE id = ?', [req.params.id]);
  if (!card) return res.status(404).json({ error: 'Flashcard not found' });

  /* ── SM-2 Algorithm ─────────────────────────────────── */
  let { easiness_factor, interval, repetitions } = card;
  const q = parseInt(quality, 10);

  if (q >= 3) {
    // Successful recall
    if (repetitions === 0)      interval = 1;
    else if (repetitions === 1) interval = 6;
    else                        interval = Math.round(interval * easiness_factor);
    repetitions += 1;
  } else {
    // Failed recall — reset
    repetitions = 0;
    interval = 1;
  }

  // Easiness factor update
  easiness_factor += 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  easiness_factor = Math.max(1.3, easiness_factor);

  // Next review date
  const next = new Date();
  next.setDate(next.getDate() + interval);
  const nextStr = next.toISOString().replace('T', ' ').substring(0, 19);
  /* ────────────────────────────────────────────────────── */

  execute(`
    UPDATE flashcards
    SET easiness_factor = ?, interval = ?, repetitions = ?, next_review_date = ?
    WHERE id = ?
  `, [easiness_factor, interval, repetitions, nextStr, req.params.id]);

  const updated = queryOne('SELECT * FROM flashcards WHERE id = ?', [req.params.id]);
  res.json(updated);
});

module.exports = router;
