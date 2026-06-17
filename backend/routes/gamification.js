const express = require('express');
const router = express.Router();
const { queryAll } = require('../db/schema');
const authMiddleware = require('./authMiddleware');

router.use(authMiddleware);

// GET /api/leaderboard — get top 10 users in a cohort
router.get('/leaderboard', async (req, res) => {
  const { university, year, semester } = req.query;
  if (!university || !year || !semester) {
    return res.status(400).json({ error: 'Cohort info required' });
  }

  const leaders = await queryAll(`
    SELECT id, username, leaderboard_name, xp, level, current_streak, reputation
    FROM users
    WHERE university = ? AND year = ? AND semester = ?
    ORDER BY xp DESC
    LIMIT 10
  `, [university, parseInt(year, 10), parseInt(semester, 10)]);

  // Don't send passwords or anything else, just the required gamification info
  res.json(leaders);
});

module.exports = router;
