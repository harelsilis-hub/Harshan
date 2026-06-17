const express = require('express');
const router = express.Router();
const { scrapeDegrees } = require('../scrape_degrees');

// GET /api/degrees/bgu
router.get('/bgu', async (req, res) => {
  try {
    // The scraper is now optimized and takes ~3 seconds, so we can await it live
    const degrees = await scrapeDegrees();
    res.json(degrees);
  } catch (err) {
    console.error('Error fetching BGU degrees:', err);
    res.status(500).json({ error: 'Failed to scrape live degrees from BGU' });
  }
});

module.exports = router;
