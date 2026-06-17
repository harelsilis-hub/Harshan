const express = require('express');
const router = express.Router();
const { queryAll, execute, queryOne } = require('../db/schema');
const { extractMoodleCalendarUrl, fetchAndParseIcs } = require('../moodle_ical_extractor');
const authMiddleware = require('./authMiddleware');

router.use(authMiddleware);

// GET /api/calendar
// Fetch private events for a user
router.get('/', async (req, res) => {
  const user_id = req.user.id;

  const events = await queryAll(`
    SELECT * FROM calendar_events 
    WHERE user_id = ?
    ORDER BY event_date ASC
  `, [parseInt(user_id, 10)]);

  res.json(events);
});

// POST /api/calendar/sync-moodle
// Sync moodle calendar for a user
router.post('/sync-moodle', async (req, res) => {
  const { moodle_username, moodle_password } = req.body;
  const user_id = req.user.id;
  
  if (!moodle_username || !moodle_password) {
    return res.status(400).json({ error: 'moodle_username and moodle_password are required' });
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
        const existing = await queryOne('SELECT id, moodle_course_id FROM calendar_events WHERE user_id = ? AND title = ? AND event_date = ?', [user_id, title, eventDate]);
        if (!existing) {
          await execute(`
            INSERT INTO calendar_events (user_id, moodle_course_id, title, event_date)
            VALUES (?, ?, ?, ?)
          `, [parseInt(user_id, 10), moodleCourseId, title, eventDate]);
          addedCount++;
        } else if (existing.moodle_course_id !== moodleCourseId) {
          await execute(`
            UPDATE calendar_events SET moodle_course_id = ? WHERE id = ?
          `, [moodleCourseId, existing.id]);
        }
      }
    }

    res.json({ success: true, addedCount });
  } catch (error) {
    console.error('Sync failed:', error);
    if (error.message && error.message.includes('INVALID_CREDENTIALS')) {
      return res.status(401).json({ error: 'שם המשתמש או הסיסמה שהזנת שגויים. נסה שוב.' });
    }
    res.status(500).json({ error: error.message || 'Sync failed' });
  }
});

// PUT /api/calendar/:id/toggle
// Toggle the completion status of an event
router.put('/:id/toggle', async (req, res) => {
  const { id } = req.params;
  const { is_completed } = req.body;
  
  try {
    const { changes } = await execute('UPDATE calendar_events SET is_completed = ? WHERE id = ? AND user_id = ?', [is_completed ? 1 : 0, id, req.user.id]);
    if (changes === 0) return res.status(404).json({ error: 'Event not found or unauthorized' });
    res.json({ success: true, is_completed: is_completed ? 1 : 0 });
  } catch (error) {
    console.error('Failed to toggle event status:', error);
    res.status(500).json({ error: 'Failed to toggle event status' });
  }
});

module.exports = router;
