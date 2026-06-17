const express = require('express');
const router = express.Router();
const { scrapeDegrees } = require('../scrape_degrees');

let cachedDegrees = null;

// GET /api/degrees/bgu
// Scrapes BGU degrees live and returns them.
router.get('/bgu', async (req, res) => {
  try {
    // If you want to force live scraping every time, remove the caching.
    // For performance, we can cache it in memory after the first live scrape.
    // Wait, the user specifically asked: "pull the degrees live when the user in the registration"
    // I will do it live to satisfy the request.

    const degrees = await scrapeDegrees();
    res.json(degrees);
  } catch (err) {
    console.error('Error fetching BGU degrees live:', err);
    res.status(500).json({ error: 'Failed to scrape live degrees from BGU' });
  }
});

module.exports = router;
