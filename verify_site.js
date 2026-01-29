const { chromium } = require('playwright');
const path = require('path');

async function checkSite() {
    console.log('Connecting to browser...');
    const browser = await chromium.launch({
        headless: true
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navigating to https://matchmaking-site.vercel.app/ ...');
    await page.goto('https://matchmaking-site.vercel.app/', { waitUntil: 'networkidle' });

    const title = await page.title();
    console.log('Page Title:', title);

    const screenshotPath = path.join(__dirname, 'verify_site.png');
    await page.screenshot({ path: screenshotPath });
    console.log('Screenshot saved to:', screenshotPath);

    const loginBtn = await page.$('#discord-login-btn');
    console.log('Login Button found:', !!loginBtn);

    await browser.close();
    console.log('Finished.');
}

checkSite().catch(err => {
    console.error('FAILED TO CHECK SITE:', err);
    process.exit(1);
});
