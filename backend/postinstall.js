const { execSync } = require('child_process');

// Force playwright to install browsers in node_modules/.local-browsers
// so they get bundled correctly in Render's runtime environment.
process.env.PLAYWRIGHT_BROWSERS_PATH = '0';

try {
  console.log('Running npx playwright install --with-deps...');
  execSync('npx playwright install --with-deps', { 
    env: process.env, 
    stdio: 'inherit' 
  });
  console.log('Playwright installation successful.');
} catch (error) {
  console.error('Failed to install Playwright browsers:', error);
  process.exit(1);
}
