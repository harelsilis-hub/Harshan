const puppeteer = require('puppeteer');
const axios = require('axios');
const ical = require('node-ical'); 

/**
 * Extracts a dynamic iCal (.ics) URL from a Moodle system.
 * 
 * @param {string} username - The Moodle username.
 * @param {string} password - The Moodle password.
 * @returns {Promise<string>} The extracted .ics URL.
 */
async function extractMoodleCalendarUrl(username, password) {
  let browser;
  try {
    // 1. Initialize headless browser (Puppeteer handles Render dependencies better)
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'] // Crucial for Render
    });
    const page = await browser.newPage();

    // 2. Navigate to the login page
    const loginUrl = 'https://moodle.bgu.ac.il/moodle/login/index.php';
    await page.goto(loginUrl, { waitUntil: 'networkidle2' });

    // 3. Fill credentials and login
    await page.waitForSelector('#username', { visible: true });
    await page.type('#username', username);
    await page.type('#password', password);
    
    // Using typical Moodle login button selectors
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('#loginbtn, button[type="submit"]')
    ]);

    // Check if we are still on the login page (means authentication failed)
    if (page.url().includes('/login/index.php')) {
        let errorText = 'Invalid Moodle credentials';
        try {
          const errorEl = await page.$('.alert-danger, #loginerrormessage, .error');
          if (errorEl) {
              errorText = await page.evaluate(el => el.innerText, errorEl);
          }
        } catch (e) {}
        throw new Error('INVALID_CREDENTIALS: ' + errorText.trim());
    }

    // 4. Navigate directly to the calendar export page
    const exportUrl = 'https://moodle.bgu.ac.il/moodle/calendar/export.php';
    await page.goto(exportUrl, { waitUntil: 'networkidle2' });

    // 5. Select "Events related to courses"
    await page.waitForSelector('input[type="radio"][value="courses"], input[type="radio"][name="events"][value="courses"]', { visible: true });
    await page.evaluate(() => {
        const el = document.querySelector('input[type="radio"][value="courses"], input[type="radio"][name="events"][value="courses"]');
        if (el) el.click();
    });

    // 6. Select "This month"
    await page.evaluate(() => {
        const el = document.querySelector('input[type="radio"][value="monthnow"], input[type="radio"][name="period"][value="monthnow"]');
        if (el) el.click();
    });

    // 7. Click the "Get calendar URL" button
    try {
        await page.waitForSelector('#generateurl, #id_generateurl, [name="generateurl"], input[value="Get calendar URL"]', { visible: true, timeout: 5000 });
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), // Sometimes it navigates, sometimes AJAX
          page.evaluate(() => {
              const el = document.querySelector('#generateurl, #id_generateurl, [name="generateurl"], input[value="Get calendar URL"]');
              if (el) el.click();
          })
        ]);
    } catch (error) {
        console.error('Failed to find the "Get calendar URL" button.');
        throw error;
    }

    // 8. Wait for the generated URL to appear
    await page.waitForSelector('#calendarexporturl, .calendarurl, #calendarurl, div.box.py-3.generalbox > div.mt-1', { visible: true, timeout: 5000 });
    
    // Check if it's an input field or a standard container
    let icsUrlText = await page.evaluate(() => {
        const urlContainer = document.querySelector('#calendarexporturl, .calendarurl, #calendarurl, div.box.py-3.generalbox > div.mt-1');
        if (!urlContainer) return '';
        if (urlContainer.tagName === 'INPUT') return urlContainer.value;
        const innerInput = urlContainer.querySelector('input[type="text"]');
        if (innerInput) return innerInput.value;
        return urlContainer.innerText;
    });
    
    // Extract actual URL if there's surrounding text
    const urlMatch = icsUrlText.match(/https?:\/\/[^\s"'>]+/);
    if (!urlMatch) {
      throw new Error(`Could not parse the URL from the page text. Text found: "${icsUrlText}"`);
    }
    
    // 9. Fetch course mapping using Moodle API
    const courseMapping = {};
    try {
        const coursesInfo = await page.evaluate(async () => {
            const req = await fetch(M.cfg.wwwroot + '/lib/ajax/service.php?sesskey=' + M.cfg.sesskey + '&info=core_course_get_enrolled_courses_by_timeline_classification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify([{"index":0,"methodname":"core_course_get_enrolled_courses_by_timeline_classification","args":{"classification":"all","limit":0,"offset":0,"sort":"fullname"}}])
            });
            const res = await req.json();
            if (res && res[0] && !res[0].error) {
                return res[0].data.courses;
            }
            return [];
        });
        
        if (coursesInfo && coursesInfo.length > 0) {
            coursesInfo.forEach(c => {
                if (c.idnumber) courseMapping[c.idnumber] = c.fullname;
                if (c.shortname) courseMapping[c.shortname] = c.fullname;
                courseMapping[c.id] = c.fullname;
            });
        }
    } catch (e) {
        console.error('Failed to fetch course mapping', e);
    }
    
    return { url: urlMatch[0], courseMapping };

  } catch (error) {
    console.error('An error occurred during Puppeteer extraction.', error.message);
    throw error;
  } finally {
    // Close browser immediately to prevent memory leaks
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Bonus: Fetches and parses an ICS file from a given URL.
 * 
 * @param {string} url - The URL to the .ics file.
 * @returns {Promise<Object>} The parsed events.
 */
async function fetchAndParseIcs(url) {
  try {
    const response = await axios.get(url);
    // Parse the ICS file using node-ical
    const events = ical.sync.parseICS(response.data);
    return events;
  } catch (error) {
    console.error('Failed to fetch or parse ICS file.', error.message);
    throw error;
  }
}

module.exports = {
  extractMoodleCalendarUrl,
  fetchAndParseIcs
};
