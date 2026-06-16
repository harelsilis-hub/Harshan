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
      AND f.learning_status = 'active'
      AND f.next_review_date <= datetime('now')
    ORDER BY f.next_review_date ASC
  `, [req.params.courseId]);
  res.json(cards);
});

// POST /api/courses/:courseId/drip-feed — unlock N flashcards into active learning
router.post('/courses/:courseId/drip-feed', (req, res) => {
  const limitParam = req.body.limit;
  let limit = 15;
  if (limitParam === 'ALL') {
    limit = 999999;
  } else if (limitParam !== undefined && !isNaN(parseInt(limitParam, 10))) {
    limit = parseInt(limitParam, 10);
  }

  const pendingCards = queryAll(`
    SELECT id FROM flashcards
    WHERE course_id = ? AND learning_status = 'pending'
    ORDER BY appearance_index ASC
    LIMIT ?
  `, [req.params.courseId, limit]);

  if (pendingCards.length === 0) {
    return res.json({ unlocked: 0, cards: [] });
  }

  const ids = pendingCards.map(c => c.id);
  const placeholders = ids.map(() => '?').join(',');
  
  execute(`
    UPDATE flashcards
    SET learning_status = 'active', next_review_date = datetime('now'), interval = 0, repetitions = 0
    WHERE id IN (${placeholders})
  `, ids);

  const unlockedCards = queryAll(`
    SELECT f.*, l.title AS lecture_title, l.summary_content AS lecture_summary
    FROM flashcards f
    JOIN lectures l ON f.lecture_id = l.id
    WHERE f.id IN (${placeholders})
    ORDER BY f.appearance_index ASC
  `, ids);

  res.json({ unlocked: unlockedCards.length, cards: unlockedCards });
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

// GET /api/courses/:courseId/cram — Ghost Review Engine (Hardest 50 Active Cards)
router.get('/courses/:courseId/cram', (req, res) => {
  const cards = queryAll(`
    SELECT f.*, l.title AS lecture_title, l.summary_content AS lecture_summary
    FROM flashcards f
    JOIN lectures l ON f.lecture_id = l.id
    WHERE f.course_id = ?
      AND f.learning_status = 'active'
    ORDER BY f.easiness_factor ASC
    LIMIT 50
  `, [req.params.courseId]);
  res.json(cards);
});

router.post('/flashcards/:id/review', (req, res) => {
  const { quality, user_id, is_cram_mode } = req.body;
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

  if (!is_cram_mode) {
    execute(`
      UPDATE flashcards
      SET easiness_factor = ?, interval = ?, repetitions = ?, next_review_date = ?
      WHERE id = ?
    `, [easiness_factor, interval, repetitions, nextStr, req.params.id]);
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
    const user = queryOne('SELECT * FROM users WHERE id = ?', [user_id]);
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
      
      execute(`
        UPDATE users 
        SET xp = ?, level = ?, current_streak = ?, last_review_date = ?, streak_freezes = ?
        WHERE id = ?
      `, [xp, level, current_streak, last_review_date, streak_freezes, user_id]);
      
      updatedUser = queryOne('SELECT * FROM users WHERE id = ?', [user_id]);
    }
  }

  const updated = is_cram_mode ? card : queryOne('SELECT * FROM flashcards WHERE id = ?', [req.params.id]);
  res.json({ card: updated, user: updatedUser });
});

module.exports = router;
