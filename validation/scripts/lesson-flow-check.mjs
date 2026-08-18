import { chromium } from 'playwright-core';

const baseUrl = process.env.APP_URL || 'http://127.0.0.1:5175/';
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});

const result = { checks: [], consoleErrors: [], pageErrors: [], failedRequests: [] };
const check = (name, passed, detail = '') => result.checks.push({ name, passed, detail });
const decorativeTerms = [
  'ORBITAL LAB', 'DEEP SPACE LINK', 'MISSION', 'TRAINING SIMULATION',
  'LROC', 'WAC', '16K TILE SCAN', 'DATA LINK', 'SCANNER',
  'SEARCH TARGET', 'SIGNAL ACQUIRED', 'MISSION CLOCK', 'DATASET',
  'FORMATION MODEL', '3D SIMULATION', 'EDUCATIONAL MODEL', '3D VIEW',
];
const sentenceCount = (text) => (text.match(/[.!?。！？]/g) || []).length;

async function watch(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') result.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('requestfailed', (request) => result.failedRequests.push(`${request.url()} :: ${request.failure()?.errorText || 'failed'}`));
}

async function assertNoDecorativeText(page, name) {
  const bodyText = await page.locator('body').innerText();
  const found = decorativeTerms.filter((term) => bodyText.includes(term));
  check(`${name} has no decorative HUD information`, found.length === 0, JSON.stringify(found));
}

async function size(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await watch(desktop);
await desktop.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await desktop.waitForSelector('main.mission-start');
check('observation is the primary start action', await desktop.getByRole('button', { name: '달 표면 관찰 시작' }).count() === 1);
check('formation is labeled as an extension activity', await desktop.getByRole('button', { name: /달의 형성 과정.*확장 탐구/ }).count() === 1);
await assertNoDecorativeText(desktop, 'start');
check('start explains the observation action in Korean', await desktop.locator('.briefing-lead').innerText().then((text) => text.includes('달 표면')));

await desktop.getByRole('button', { name: '달 표면 관찰 시작' }).click();
await desktop.waitForSelector('.game-shell');
await desktop.waitForSelector('.openseadragon-container');
await desktop.waitForTimeout(900);
await assertNoDecorativeText(desktop, 'observer');
check('observer has Korean touch and mouse guidance', await desktop.locator('.map-legend--bottom').innerText().then((text) => text.includes('달을 움직이기') && text.includes('확대')));
check('observer has no separate title in explanation card', await desktop.locator('.intel-card__title').count() === 0 && await desktop.locator('.intel-card h2').count() === 0);

await desktop.getByRole('button', { name: /달의 바다/ }).click();
await desktop.waitForTimeout(250);
const explanation = await desktop.locator('.intel-card p').innerText();
check('explanation is one or two sentences', sentenceCount(explanation) >= 1 && sentenceCount(explanation) <= 2, explanation);
check('selecting a target does not count as finding it', await desktop.locator('.mission-console .progress-count').innerText() === '0 / 3');
check('selected target offers an explicit found action', await desktop.locator('.intel-found').count() === 1);
await desktop.locator('.intel-found').click();
check('explicit found action updates progress', await desktop.locator('.mission-console .progress-count').innerText() === '1 / 3');

for (const label of ['충돌 구덩이', '밝게 보이는 곳']) {
  await desktop.getByRole('button', { name: new RegExp(label) }).click();
  await desktop.locator('.intel-found').click();
}
check('summary appears after all three observations', await desktop.locator('.lesson-summary').count() === 1);
check('summary includes the round-moon concept', await desktop.locator('.lesson-summary').innerText().then((text) => text.includes('둥근 공 모양')));
check('summary includes craters and mare', await desktop.locator('.lesson-summary').innerText().then((text) => text.includes('충돌 구덩이') && text.includes('달의 바다')));
check('observation record input is available', await desktop.getByRole('textbox', { name: '관찰 기록' }).count() === 1);
const desktopSize = await size(desktop);
check('desktop has no horizontal overflow', desktopSize.scrollWidth <= desktopSize.clientWidth + 1, JSON.stringify(desktopSize));

await desktop.getByRole('button', { name: '처음 화면' }).click();
await desktop.getByRole('button', { name: /달의 형성 과정.*확장 탐구/ }).click();
await desktop.waitForSelector('.formation-screen');
await desktop.waitForSelector('canvas[data-formation-canvas="true"]', { timeout: 10000 });
await desktop.waitForTimeout(1000);
await assertNoDecorativeText(desktop, 'formation');
check('formation explanation has no separate title', await desktop.locator('.formation-modal h1').count() === 0);

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await watch(mobile);
await mobile.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await mobile.getByRole('button', { name: '달 표면 관찰 시작' }).click();
await mobile.waitForSelector('.openseadragon-container');
const mobileSize = await size(mobile);
check('mobile has no horizontal overflow', mobileSize.scrollWidth <= mobileSize.clientWidth + 1, JSON.stringify(mobileSize));
check('mobile uses touch-specific guidance', await mobile.locator('.map-legend--bottom .mobile-guide').count() === 1);

await desktop.screenshot({ path: '/tmp/moon-observatory-refined-desktop.png', fullPage: true });
await mobile.screenshot({ path: '/tmp/moon-observatory-refined-mobile.png', fullPage: true });
await browser.close();

console.log(JSON.stringify(result, null, 2));
if (result.pageErrors.length || result.consoleErrors.length || result.failedRequests.length || result.checks.some((item) => !item.passed)) process.exitCode = 1;
