const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../db/schema');

// GET /api/courses — list all courses with stats (optionally filter by semester_id)
router.get('/', (req, res) => {
  const { semester_id } = req.query;
  const filterClause = semester_id ? `WHERE c.semester_id = ${parseInt(semester_id, 10)}` : '';
  const courses = queryAll(`
    SELECT c.*,
      (SELECT COUNT(*) FROM lectures  WHERE course_id = c.id) AS lecture_count,
      (SELECT COUNT(*) FROM flashcards WHERE course_id = c.id) AS flashcard_count,
      (SELECT COUNT(*) FROM flashcards
         WHERE course_id = c.id
           AND next_review_date <= datetime('now')) AS due_count
    FROM courses c
    ${filterClause}
    ORDER BY c.created_at DESC
  `);
  res.json(courses);
});

// GET /api/courses/:id — single course with stats
router.get('/:id', (req, res) => {
  const course = queryOne(`
    SELECT c.*,
      (SELECT COUNT(*) FROM lectures  WHERE course_id = c.id) AS lecture_count,
      (SELECT COUNT(*) FROM flashcards WHERE course_id = c.id) AS flashcard_count,
      (SELECT COUNT(*) FROM flashcards
         WHERE course_id = c.id
           AND next_review_date <= datetime('now')) AS due_count
    FROM courses c
    WHERE c.id = ?
  `, [req.params.id]);

  if (!course) return res.status(404).json({ error: 'Course not found' });
  res.json(course);
});

// POST /api/courses — create course
router.post('/', (req, res) => {
  const { name, semester_id } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Course name is required' });
  }
  if (!semester_id) {
    return res.status(400).json({ error: 'semester_id is required' });
  }
  const { lastId } = execute('INSERT INTO courses (name, semester_id) VALUES (?, ?)', [name.trim(), semester_id]);
  const course = queryOne('SELECT * FROM courses WHERE id = ?', [lastId]);
  res.status(201).json(course);
});

// DELETE /api/courses/:id — delete course (cascades)
router.delete('/:id', (req, res) => {
  // Manually cascade since sql.js FK cascade can be unreliable
  execute('DELETE FROM flashcards WHERE course_id = ?', [req.params.id]);
  execute('DELETE FROM lectures WHERE course_id = ?', [req.params.id]);
  const { changes } = execute('DELETE FROM courses WHERE id = ?', [req.params.id]);
  if (changes === 0) {
    return res.status(404).json({ error: 'Course not found' });
  }
  res.json({ success: true });
});

module.exports = router;
