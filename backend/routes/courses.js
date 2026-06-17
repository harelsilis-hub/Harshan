const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../db/schema');
const authMiddleware = require('./authMiddleware');

router.use(authMiddleware);

// GET /api/courses — list all courses with stats (optionally filter by semester_id)
router.get('/', async (req, res) => {
  const { semester_id } = req.query;
  const filterClause = semester_id ? `WHERE c.semester_id = ${parseInt(semester_id, 10)} AND c.user_id = ?` : `WHERE c.user_id = ?`;
  const courses = await queryAll(`
    SELECT c.*,
      (SELECT COUNT(*) FROM lectures  WHERE course_id = c.id AND user_id = ?) AS lecture_count,
      (SELECT COUNT(*) FROM flashcards WHERE course_id = c.id AND user_id = ?) AS flashcard_count,
      (SELECT COUNT(*) FROM flashcards
         WHERE course_id = c.id
           AND user_id = ?
           AND learning_status = 'active'
           AND next_review_date <= NOW()) AS due_count,
      (SELECT COUNT(*) FROM flashcards
         WHERE course_id = c.id
           AND user_id = ?
           AND learning_status = 'pending') AS pending_count
    FROM courses c
    ${filterClause}
    ORDER BY c.created_at DESC
  `, [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]);
  res.json(courses);
});

// GET /api/courses/:id — single course with stats
router.get('/:id', async (req, res) => {
  const course = await queryOne(`
    SELECT c.*,
      (SELECT COUNT(*) FROM lectures  WHERE course_id = c.id AND user_id = ?) AS lecture_count,
      (SELECT COUNT(*) FROM flashcards WHERE course_id = c.id AND user_id = ?) AS flashcard_count,
      (SELECT COUNT(*) FROM flashcards
         WHERE course_id = c.id
           AND user_id = ?
           AND learning_status = 'active'
           AND next_review_date <= NOW()) AS due_count,
      (SELECT COUNT(*) FROM flashcards
         WHERE course_id = c.id
           AND user_id = ?
           AND learning_status = 'pending') AS pending_count
    FROM courses c
    WHERE c.id = ? AND c.user_id = ?
  `, [req.user.id, req.user.id, req.user.id, req.user.id, req.params.id, req.user.id]);

  if (!course) return res.status(404).json({ error: 'Course not found' });
  res.json(course);
});

// POST /api/courses — create course
router.post('/', async (req, res) => {
  const { name, semester_id } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Course name is required' });
  }
  if (!semester_id) {
    return res.status(400).json({ error: 'semester_id is required' });
  }
  const { lastId } = await execute('INSERT INTO courses (name, semester_id, user_id) VALUES (?, ?, ?)', [name.trim(), semester_id, req.user.id]);
  const course = await queryOne('SELECT * FROM courses WHERE id = ?', [lastId]);
  res.status(201).json(course);
});

// DELETE /api/courses/:id — delete course (cascades)
router.delete('/:id', async (req, res) => {
  // Manually cascade since sql.js FK cascade can be unreliable
  await execute('DELETE FROM flashcards WHERE course_id = ? AND user_id = ?', [req.params.id, req.user.id]);
  await execute('DELETE FROM lectures WHERE course_id = ? AND user_id = ?', [req.params.id, req.user.id]);
  const { changes } = await execute('DELETE FROM courses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (changes === 0) {
    return res.status(404).json({ error: 'Course not found' });
  }
  res.json({ success: true });
});

module.exports = router;
