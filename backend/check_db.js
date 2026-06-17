const { getDb, queryAll } = require('./db/schema');
getDb().then(() => {
  const university = 'בן גוריון';
  const year = 1;
  const semester = 2;
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
  `, [university, year, semester]);
  console.log('Result:', lectures);
});
