const { chromium } = require('playwright');
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
  let context;
  try {
    // 1. Initialize headless browser and isolated context
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    const page = await context.newPage();

    // 2. Navigate to the login page
    const loginUrl = 'https://moodle.bgu.ac.il/moodle/login/index.php';
    await page.goto(loginUrl, { waitUntil: 'networkidle' });

    // 3. Fill credentials and login using explicit waits
    const usernameInput = page.locator('#username');
    const passwordInput = page.locator('#password');
    
    await usernameInput.waitFor({ state: 'visible' });
    await usernameInput.fill(username);
    
    // Explicitly avoiding logging the password or passing it to external APIs
    await passwordInput.fill(password);
    
    // Using typical Moodle login button selectors
    await page.click('#loginbtn, button[type="submit"]');

    // Wait for authentication request to complete
    await page.waitForLoadState('networkidle');

    // Check if we are still on the login page (means authentication failed)
    if (page.url().includes('/login/index.php')) {
        let errorText = 'Invalid Moodle credentials';
        const errorEl = page.locator('.alert-danger, #loginerrormessage, .error').first();
        if (await errorEl.count() > 0) {
            errorText = await errorEl.innerText();
        }
        throw new Error('INVALID_CREDENTIALS: ' + errorText.trim());
    }

    // 4. Navigate directly to the calendar export page
    const exportUrl = 'https://moodle.bgu.ac.il/moodle/calendar/export.php';
    await page.goto(exportUrl, { waitUntil: 'networkidle' });

    // 5. Select "Events related to courses"
    // Using value="courses" which is standard in Moodle
    const coursesRadio = page.locator('input[type="radio"][value="courses"], input[type="radio"][name="events"][value="courses"]').first();
    await coursesRadio.waitFor({ state: 'visible' });
    await coursesRadio.check();

    // 6. Select "This month"
    // Using value="monthnow" or similar standard Moodle value
    const monthRadio = page.locator('input[type="radio"][value="monthnow"], input[type="radio"][name="period"][value="monthnow"]').first();
    await monthRadio.check();

    // 7. Click the "Get calendar URL" button
    const generateBtn = page.locator('#generateurl, #id_generateurl, [name="generateurl"], button:has-text("Get calendar URL"), input[value="Get calendar URL"]').first();
    
    try {
        await generateBtn.waitFor({ state: 'visible', timeout: 5000 });
        await generateBtn.click();
    } catch (error) {
        const fs = require('fs');
        const path = require('path');
        fs.writeFileSync(path.join(__dirname, 'moodle_debug_dump.html'), await page.content());
        console.error('Failed to find the "Get calendar URL" button. Page HTML dumped to moodle_debug_dump.html');
        throw error;
    }

    // 8. Wait for the generated URL to appear
    const urlContainer = page.locator('#calendarexporturl, .calendarurl, #calendarurl, div.box.py-3.generalbox > div.mt-1').first();
    await urlContainer.waitFor({ state: 'visible', timeout: 5000 });
    
    // Check if it's an input field or a standard container
    const isInput = await urlContainer.evaluate(node => node.tagName === 'INPUT');
    let icsUrlText = isInput ? await urlContainer.inputValue() : await urlContainer.innerText();
    
    if (!icsUrlText.match(/https?:\/\/[^\s"'>]+/)) {
        // Try finding an input inside the container as a fallback
        const innerInput = urlContainer.locator('input[type="text"]').first();
        if (await innerInput.count() > 0) {
            icsUrlText = await innerInput.inputValue();
        }
    }
    
    // Extract actual URL if there's surrounding text
    const urlMatch = icsUrlText.match(/https?:\/\/[^\s"'>]+/);
    if (!urlMatch) {
      const fs = require('fs');
      const path = require('path');
      fs.writeFileSync(path.join(__dirname, 'moodle_debug_dump_url.html'), await page.content());
      throw new Error(`Could not parse the URL from the page text. Text found: "${icsUrlText}". Page dumped to moodle_debug_dump_url.html`);
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
    // Rethrow error to be handled by the caller microservice
    console.error('An error occurred during Playwright extraction.', error.message);
    throw error;
  } finally {
    // 9. Close context and browser immediately to prevent memory leaks
    if (context) {
      await context.close();
    }
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
