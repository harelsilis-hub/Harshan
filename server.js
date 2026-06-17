require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*' // allow all for now, to make vercel connection easy
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database then start server
const { getDb } = require('./db/schema');

getDb().then(() => {
  console.log('✅ Database initialized');

  // Routes
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/semesters', require('./routes/semesters'));
  app.use('/api/courses', require('./routes/courses'));
  app.use('/api/calendar', require('./routes/calendar'));
  app.use('/api', require('./routes/flashcards'));
  app.use('/api', require('./routes/lectures'));
  app.use('/api', require('./routes/gamification'));

  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`🧠 Learning Hub running at http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
