const express = require('express');
const router = express.Router();
const { queryAll, execute } = require('../db/schema');

// GET /api/calendar
// Fetch events for a specific cohort
router.get('/', (req, res) => {
  const { university, year, semester } = req.query;
  
  if (!university || !year || !semester) {
    return res.status(400).json({ error: 'university, year, and semester query params are required' });
  }

  const events = queryAll(`
    SELECT * FROM calendar_events 
    WHERE university = ? AND year = ? AND semester = ?
    ORDER BY event_date ASC
  `, [university, parseInt(year, 10), parseInt(semester, 10)]);

  res.json(events);
});

// POST /api/calendar
// Create a new event for a cohort
router.post('/', (req, res) => {
  const { university, year, semester, title, event_date, created_by_user_id } = req.body;
  
  if (!university || !year || !semester || !title || !event_date || !created_by_user_id) {
    return res.status(400).json({ error: 'All fields are required to create an event' });
  }

  const { lastId } = execute(`
    INSERT INTO calendar_events (university, year, semester, title, event_date, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [university, parseInt(year, 10), parseInt(semester, 10), title, event_date, parseInt(created_by_user_id, 10)]);

  res.status(201).json({ id: lastId, success: true });
});

module.exports = router;
