const { chromium } = require('playwright');
const fs = require('fs/promises');
const path = require('path');

/**
 * Scrapes the official list of academic departments from the Ben-Gurion University course catalog.
 * Uses Playwright to handle the legacy Oracle APEX/PLSQL portal, explicit waits, and frame navigation.
 */
async function scrapeDegrees() {
  console.log('Launching headless browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    console.log('Navigating to BGU syllabus portal...');
    // Navigate to the main gate URL
    await page.goto('https://bgu4u.bgu.ac.il/pls/scwp/!app.gate?app=ann', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // The BGU portal uses frames. The main content is inside the frame named "main".
    const mainFrame = page.frameLocator('frame[name="main"]');

    console.log('Waiting for the Simple Search (חיפוש פשוט) link to appear...');
    const simpleSearchLink = mainFrame.locator('text=חיפוש פשוט');
    await simpleSearchLink.waitFor({ state: 'visible', timeout: 30000 });
    
    console.log('Clicking on Simple Search to reveal the search form...');
    await simpleSearchLink.click();

    console.log('Waiting for the department dropdown to load...');
    // The specific select element containing departments is #on_course_department_list
    const deptSelect = mainFrame.locator('#on_course_department_list');
    await deptSelect.waitFor({ state: 'attached', timeout: 30000 });

    console.log('Extracting department options...');
    // Grab all <option> elements within the department <select>
    const optionsLocators = await deptSelect.locator('option').all();
    
    const degrees = [];
    for (const option of optionsLocators) {
      const text = await option.textContent();
      const value = await option.getAttribute('value');
      
      // Ignore empty or default options (e.g. "בחר מחלקה" / Select Department)
      if (value && value.trim() !== '' && text && !text.includes('בחר')) {
        degrees.push({
          id: value.trim(),
          name: text.trim().replace(/\s+/g, ' ') // Normalize spaces
        });
      }
    }

    console.log(`Successfully extracted ${degrees.length} departments.`);

    return degrees;
  } catch (error) {
    console.error('An error occurred during the scraping process:', error);
    throw error;
  } finally {
    console.log('Closing the browser gracefully...');
    await browser.close();
  }
}

module.exports = { scrapeDegrees };

// Execute the scraping function if run directly
if (require.main === module) {
  scrapeDegrees().catch(console.error);
}
