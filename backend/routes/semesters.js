const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../db/schema');
const authMiddleware = require('./authMiddleware');

router.use(authMiddleware);

// GET /api/semesters — list all semesters with course counts
router.get('/', async (req, res) => {
  const semesters = await queryAll(`
    SELECT s.*,
      (SELECT COUNT(*) FROM courses WHERE semester_id = s.id AND user_id = ?) AS course_count
    FROM semesters s
    WHERE s.user_id = ?
    ORDER BY s.created_at ASC
  `, [req.user.id, req.user.id]);
  res.json(semesters);
});

// GET /api/semesters/:id — single semester
router.get('/:id', async (req, res) => {
  const semester = await queryOne(`
    SELECT s.*,
      (SELECT COUNT(*) FROM courses WHERE semester_id = s.id AND user_id = ?) AS course_count
    FROM semesters s
    WHERE s.id = ? AND s.user_id = ?
  `, [req.user.id, req.params.id, req.user.id]);

  if (!semester) return res.status(404).json({ error: 'Semester not found' });
  res.json(semester);
});

// POST /api/semesters — create semester
router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Semester name is required' });
  }
  const { lastId } = await execute('INSERT INTO semesters (name, user_id) VALUES (?, ?)', [name.trim(), req.user.id]);
  const semester = await queryOne('SELECT * FROM semesters WHERE id = ?', [lastId]);
  res.status(201).json(semester);
});

// DELETE /api/semesters/:id — delete semester and all courses inside it
router.delete('/:id', async (req, res) => {
  // Cascades aren't fully reliable with sql.js, manual cascade
  // Find all courses in this semester to delete their flashcards/lectures
  const courses = await queryAll('SELECT id FROM courses WHERE semester_id = ? AND user_id = ?', [req.params.id, req.user.id]);
  
  for (const course of courses) {
    await execute('DELETE FROM flashcards WHERE course_id = ? AND user_id = ?', [course.id, req.user.id]);
    await execute('DELETE FROM lectures WHERE course_id = ? AND user_id = ?', [course.id, req.user.id]);
  }
  await execute('DELETE FROM courses WHERE semester_id = ? AND user_id = ?', [req.params.id, req.user.id]);
  
  const { changes } = await execute('DELETE FROM semesters WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (changes === 0) {
    return res.status(404).json({ error: 'Semester not found' });
  }
  res.json({ success: true });
});

module.exports = router;
