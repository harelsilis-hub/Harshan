const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const { queryOne, execute } = require('../db/schema');

const CLIENT_ID = '611572387185-locggqgusn3a64r1eijdei4gege59ltf.apps.googleusercontent.com';
const client = new OAuth2Client(CLIENT_ID);

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { credential, university, year, semester, leaderboard_name } = req.body;
  
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
  let user = queryOne('SELECT * FROM users WHERE username = ?', [cleanUsername]);
  
  if (!user) {
    if (!university || !year || !semester || !leaderboard_name || !leaderboard_name.trim()) {
       return res.status(400).json({ 
         error: 'University, year, semester, and full name are required for new users',
         requiresProfileCompletion: true,
         email: payload.email,
         name: payload.name
       });
    }
    const cleanLeaderboardName = leaderboard_name.trim();
    const { lastId } = execute(
      'INSERT INTO users (username, password, university, year, semester, leaderboard_name) VALUES (?, ?, ?, ?, ?, ?)',
      [cleanUsername, dummyPassword, university.trim(), parseInt(year, 10), parseInt(semester, 10), cleanLeaderboardName]
    );
    user = queryOne('SELECT * FROM users WHERE id = ?', [lastId]);
  }
  
  // Remove password from response
  delete user.password;

  res.json(user);
});

module.exports = router;
