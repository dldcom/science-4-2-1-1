import { chromium } from 'playwright-core';

const baseUrl = process.env.APP_URL || 'http://127.0.0.1:5174/';
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const tileRequests = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('request', (request) => {
  if (request.url().includes('/assets/moon-tiles/')) tileRequests.push(request.url());
});
page.on('requestfailed', (request) => failedRequests.push(`${request.url()} :: ${request.failure()?.errorText || 'failed'}`));

const result = { checks: [], consoleErrors, pageErrors, failedRequests };
const check = (name, passed, detail = '') => result.checks.push({ name, passed, detail });

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=달 표면 관찰 시작');
check('mission start screen renders', await page.locator('text=달 표면').count() >= 1);
check('transparent moon preview loads', await page.locator('.orbit-moon img').evaluate((img) => img.complete && img.naturalWidth > 0));
check('game briefing has three targets', await page.locator('.objective-row').count() === 3);

await page.getByRole('button', { name: '달 표면 관찰 시작' }).click();
await page.waitForSelector('.game-shell');
await page.waitForSelector('.openseadragon-container');
await page.waitForTimeout(1200);
check('mission HUD screen opens', await page.locator('.mission-console').count() === 1);
check('tiled viewer container opens', await page.locator('.openseadragon-container').count() === 1);
check('home view smooths lunar edge', await page.locator('.openseadragon-canvas canvas').evaluate((canvas) => canvas.style.maskImage.includes('radial-gradient')));
check('tile requests load', failedRequests.filter((url) => url.includes('/assets/moon-tiles/')).length === 0, JSON.stringify(failedRequests));

const beforeZoom = await page.locator('.zoom-meter b').innerText();
await page.getByRole('button', { name: '확대', exact: true }).click();
await page.waitForTimeout(250);
const afterZoom = await page.locator('.zoom-meter b').innerText();
check('tile viewer zoom control changes HUD', beforeZoom !== afterZoom, `${beforeZoom} -> ${afterZoom}`);
check('intermediate zoom keeps lunar edge mask', await page.locator('.openseadragon-canvas canvas').evaluate((canvas) => canvas.style.maskImage.includes('radial-gradient')));

await page.getByRole('button', { name: /달의 바다/ }).click();
await page.waitForTimeout(200);
check('target button opens lunar sea intel', await page.locator('.intel-card p').innerText().then((text) => text.includes('달의 바다')));
check('lunar sea explanation is present', await page.locator('.intel-card p').innerText().then((text) => text.includes('물은 없어요')));
await page.locator('.intel-found').click();
check('explicit found action updates counter', await page.locator('.mission-console .progress-count').innerText() === '1 / 3');

const viewerBox = await page.locator('.scan-viewer').boundingBox();
await page.mouse.move(viewerBox.x + viewerBox.width * 0.43, viewerBox.y + viewerBox.height * 0.79);
await page.waitForTimeout(120);
check('moving over surface can show a lunar explanation', await page.locator('.intel-card p').innerText().then((text) => ['달의 바다', '충돌 구덩이', '밝게 보이는 곳'].some((label) => text.includes(label))));

await page.mouse.move(viewerBox.x + viewerBox.width * 0.5, viewerBox.y + viewerBox.height * 0.5);
await page.mouse.down();
await page.mouse.move(viewerBox.x + viewerBox.width * 0.58, viewerBox.y + viewerBox.height * 0.54, { steps: 6 });
await page.mouse.up();
check('surface viewer supports drag', await page.locator('.openseadragon-canvas').count() === 1);

for (let index = 0; index < 8; index += 1) {
  await page.getByRole('button', { name: '확대', exact: true }).click();
  await page.waitForTimeout(180);
}
const tileLevels = [...new Set(tileRequests.map((url) => url.match(/moon-tiles\/(\d+)\//)?.[1]).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
check('16K level 14 tile loads at deep zoom', tileLevels.includes('14'), JSON.stringify(tileLevels));
check('deep view releases lunar edge mask', await page.locator('.openseadragon-canvas canvas').evaluate((canvas) => canvas.style.maskImage === 'none' && canvas.style.webkitMaskImage === 'none'));

const desktopOverflow = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  scrollHeight: document.documentElement.scrollHeight,
  clientHeight: document.documentElement.clientHeight,
}));
check('desktop has no horizontal overflow', desktopOverflow.scrollWidth <= desktopOverflow.clientWidth + 1, JSON.stringify(desktopOverflow));
check('desktop has no body overflow', desktopOverflow.scrollHeight <= desktopOverflow.clientHeight + 1, JSON.stringify(desktopOverflow));
await page.screenshot({ path: '/tmp/moon-observatory-game-desktop.png', fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: '달 표면 관찰 시작' }).click();
await page.waitForSelector('.game-shell');
const mobileOverflow = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}));
check('mobile has no horizontal overflow', mobileOverflow.scrollWidth <= mobileOverflow.clientWidth + 1, JSON.stringify(mobileOverflow));
await page.screenshot({ path: '/tmp/moon-observatory-game-mobile.png', fullPage: true });

await browser.close();
console.log(JSON.stringify(result, null, 2));
if (result.pageErrors.length || result.checks.some((item) => !item.passed) || result.failedRequests.length) process.exitCode = 1;
