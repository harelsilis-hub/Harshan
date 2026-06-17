const express = require('express');
const router = express.Router();
const fs = require('fs/promises');
const path = require('path');
const { scrapeDegrees } = require('../scrape_degrees');

// GET /api/degrees/bgu
router.get('/bgu', async (req, res) => {
  try {
    const filePath = path.join(__dirname, '../degrees.json');
    let degrees = [];
    
    try {
      // Try to read the instantly available file first
      const data = await fs.readFile(filePath, 'utf8');
      degrees = JSON.parse(data);
    } catch (e) {
      console.log('degrees.json not found, falling back to empty array temporarily');
    }

    // Serve whatever we have immediately so the frontend doesn't timeout!
    res.json(degrees);

    // Fire off a background scrape to keep the file updated for the next request.
    // We do NOT await this, so it doesn't block the response.
    scrapeDegrees().catch(err => console.error('Background degree scrape failed:', err));

  } catch (err) {
    console.error('Error fetching BGU degrees:', err);
    res.status(500).json({ error: 'Failed to serve degrees' });
  }
});

module.exports = router;
