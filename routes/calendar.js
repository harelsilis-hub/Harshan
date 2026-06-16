const express = require('express');
const router = express.Router();
const { queryAll, execute, queryOne } = require('../db/schema');
const { extractMoodleCalendarUrl, fetchAndParseIcs } = require('../moodle_ical_extractor');

// GET /api/calendar
// Fetch private events for a user
router.get('/', (req, res) => {
  const { user_id } = req.query;
  
  if (!user_id) {
    return res.status(400).json({ error: 'user_id query param is required' });
  }

  const events = queryAll(`
    SELECT * FROM calendar_events 
    WHERE user_id = ?
    ORDER BY event_date ASC
  `, [parseInt(user_id, 10)]);

  res.json(events);
});

// POST /api/calendar/sync-moodle
// Sync moodle calendar for a user
router.post('/sync-moodle', async (req, res) => {
  const { moodle_username, moodle_password, user_id } = req.body;
  
  if (!moodle_username || !moodle_password || !user_id) {
    return res.status(400).json({ error: 'moodle_username, moodle_password, and user_id are required' });
  }

  try {
    // 1. Extract URL and course mapping using Playwright
    const { url, courseMapping } = await extractMoodleCalendarUrl(moodle_username, moodle_password);
    
    if (!url) {
      return res.status(500).json({ error: 'Failed to extract Moodle Calendar URL' });
    }

    // 2. Fetch and parse ICS
    const parsedEvents = await fetchAndParseIcs(url);
    
    let addedCount = 0;

    // 3. Insert events
    for (const key in parsedEvents) {
      const event = parsedEvents[key];
      if (event.type === 'VEVENT') {
        // BGU Moodle usually puts the course ID in categories array
        let moodleCourseId = (event.categories && event.categories.length > 0) ? event.categories[0] : 'General';
        
        // Replace with human readable name if we fetched it
        let matchedName = null;
        if (courseMapping) {
            // Exact match
            if (courseMapping[moodleCourseId]) {
                matchedName = courseMapping[moodleCourseId];
            } else {
                // Fuzzy match: check if the long event category ID contains the course shortname/idnumber
                for (const [key, val] of Object.entries(courseMapping)) {
                    if (key && key.length >= 5 && (moodleCourseId.includes(key) || key.includes(moodleCourseId))) {
                        matchedName = val;
                        break;
                    }
                }
            }
        }
        
        if (matchedName) {
            moodleCourseId = matchedName;
        }
        
        const title = event.summary;
        const eventDate = event.start ? event.start.toISOString().replace('T', ' ').substring(0, 19) : null;
        
        if (!eventDate || !title) continue;

        // Check for duplicates
        const existing = queryOne('SELECT id, moodle_course_id FROM calendar_events WHERE user_id = ? AND title = ? AND event_date = ?', [user_id, title, eventDate]);
        if (!existing) {
          execute(`
            INSERT INTO calendar_events (user_id, moodle_course_id, title, event_date)
            VALUES (?, ?, ?, ?)
          `, [parseInt(user_id, 10), moodleCourseId, title, eventDate]);
          addedCount++;
        } else if (existing.moodle_course_id !== moodleCourseId) {
          execute(`
            UPDATE calendar_events SET moodle_course_id = ? WHERE id = ?
          `, [moodleCourseId, existing.id]);
        }
      }
    }

    res.json({ success: true, addedCount });
  } catch (error) {
    console.error('Sync failed:', error);
    res.status(500).json({ error: error.message || 'Sync failed' });
  }
});

// PUT /api/calendar/:id/toggle
// Toggle the completion status of an event
router.put('/:id/toggle', (req, res) => {
  const { id } = req.params;
  const { is_completed } = req.body;
  
  try {
    execute('UPDATE calendar_events SET is_completed = ? WHERE id = ?', [is_completed ? 1 : 0, id]);
    res.json({ success: true, is_completed: is_completed ? 1 : 0 });
  } catch (error) {
    console.error('Failed to toggle event status:', error);
    res.status(500).json({ error: 'Failed to toggle event status' });
  }
});

module.exports = router;
