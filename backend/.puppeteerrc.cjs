const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer so Render includes it in the build
  cacheDirectory: join(__dirname, 'node_modules', '.puppeteer_cache'),
};
