import { chromium } from 'playwright-core';

const baseUrl = process.env.APP_URL || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  const originalSetInterval = window.setInterval.bind(window);
  const originalClearInterval = window.clearInterval.bind(window);
  const intervals = [];
  window.__formationIntervals = intervals;
  window.setInterval = (callback, delay, ...args) => {
    if (delay === 50 || delay === 180) {
      const entry = { callback, delay, args, active: true };
      intervals.push(entry);
      return entry;
    }
    return originalSetInterval(callback, delay, ...args);
  };
  window.clearInterval = (handle) => {
    if (handle && typeof handle === 'object' && 'active' in handle) {
      handle.active = false;
      return;
    }
    originalClearInterval(handle);
  };
  window.__tickFormation = () => {
    intervals.filter((entry) => entry.active && entry.delay === 50).forEach((entry) => entry.callback(...entry.args));
  };
});
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => failedRequests.push(`${request.url()} :: ${request.failure()?.errorText || 'failed'}`));

async function tick(count) {
  for (let index = 0; index < count; index += 1) {
    await page.evaluate(() => window.__tickFormation());
    await page.waitForTimeout(20);
  }
}

async function stage(name, count) {
  await tick(count);
  await page.screenshot({ path: `/tmp/moon-impact-burial-${name}.png`, fullPage: true });
  return page.evaluate(() => ({
    label: document.querySelector('.formation-stage__topline b')?.textContent || '',
    progress: document.querySelector('.formation-immersive__progress > span')?.style.width || '',
  }));
}

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: '달의 형성 과정 보기' }).click();
await page.waitForSelector('canvas[data-formation-canvas="true"]', { timeout: 10000 });
await page.waitForFunction(() => !document.querySelector('.formation-loading'), undefined, { timeout: 10000 });
await page.getByRole('button', { name: '다음 단계' }).click();
await page.waitForTimeout(80);

const flight = await stage('flight', 8);
const contact = await stage('contact', 3);
const bodyGoneResidual = await stage('body-gone-residual', 4);
const lateSettling = await stage('late-settling', 1);
const settled = await stage('settled', 1);

const result = { stages: { flight, contact, bodyGoneResidual, lateSettling, settled }, consoleErrors, pageErrors, failedRequests };
await browser.close();
console.log(JSON.stringify(result, null, 2));
if (consoleErrors.length || pageErrors.length || failedRequests.length) process.exitCode = 1;
