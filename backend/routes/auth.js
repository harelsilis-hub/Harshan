const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { OAuth2Client } = require('google-auth-library');
const { queryOne, execute } = require('../db/schema');

const CLIENT_ID = '611572387185-locggqgusn3a64r1eijdei4gege59ltf.apps.googleusercontent.com';
const client = new OAuth2Client(CLIENT_ID);

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { credential, university, degree, year, semester, leaderboard_name } = req.body;
  
  if (!credential) {
    return res.status(400).json({ error: 'Google credential is required' });
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (error) {
    console.error('Google token verification failed:', error);
    return res.status(401).json({ error: 'Invalid Google credential' });
  }

  const cleanUsername = payload.email.trim();
  const dummyPassword = 'google-auth'; // We no longer use passwords

  // check if user exists
  let user = await queryOne('SELECT * FROM users WHERE username = ?', [cleanUsername]);
  
  if (!user) {
    if (!university || !degree || !year || !semester || !leaderboard_name || !leaderboard_name.trim()) {
       return res.status(400).json({ 
         error: 'University, degree, year, semester, and full name are required for new users',
         requiresProfileCompletion: true,
         email: payload.email,
         name: payload.name
       });
    }
    const cleanLeaderboardName = leaderboard_name.trim();
    const { lastId } = await execute(
      'INSERT INTO users (username, password, university, degree, year, semester, leaderboard_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [cleanUsername, dummyPassword, university.trim(), degree.trim(), parseInt(year, 10), parseInt(semester, 10), cleanLeaderboardName]
    );
    user = await queryOne('SELECT * FROM users WHERE id = ?', [lastId]);
  }
  
  // Remove password from response
  delete user.password;

  res.json(user);
});

// POST /api/auth/register-email
router.post('/register-email', async (req, res) => {
  const { email, password, university, degree, year, semester, leaderboard_name } = req.body;
  
  if (!email || !password || !university || !degree || !year || !semester || !leaderboard_name) {
    return res.status(400).json({ error: 'All fields are required for registration.' });
  }

  const cleanUsername = email.trim();
  
  // Check if user exists
  let user = await queryOne('SELECT * FROM users WHERE username = ?', [cleanUsername]);
  if (user) {
    return res.status(400).json({ error: 'An account with this email already exists.' });
  }

  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const cleanLeaderboardName = leaderboard_name.trim();

    const { lastId } = await execute(
      'INSERT INTO users (username, password, university, degree, year, semester, leaderboard_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [cleanUsername, hashedPassword, university.trim(), degree.trim(), parseInt(year, 10), parseInt(semester, 10), cleanLeaderboardName]
    );

    user = await queryOne('SELECT * FROM users WHERE id = ?', [lastId]);
    delete user.password;
    res.json(user);
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to create account.' });
  }
});

// POST /api/auth/login-email
router.post('/login-email', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const cleanUsername = email.trim();
  const user = await queryOne('SELECT * FROM users WHERE username = ?', [cleanUsername]);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Prevent Google-only users from logging in via password
  if (user.password === 'google-auth') {
    return res.status(401).json({ error: 'This account is linked to Google. Please sign in with Google.' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  delete user.password;
  res.json(user);
});

module.exports = router;
