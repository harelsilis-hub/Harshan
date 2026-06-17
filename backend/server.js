process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'https://harshan.tools.hub02.com'],
  credentials: true
}));
app.use(express.json());
// Removed static file serving

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

  // Serve static files from the frontend directory
  app.use(express.static(path.join(__dirname, '../frontend')));

  // API fallback
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  // Frontend fallback (for SPA routing)
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  });

  app.listen(PORT, () => {
    console.log(`🧠 Learning Hub running at http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
