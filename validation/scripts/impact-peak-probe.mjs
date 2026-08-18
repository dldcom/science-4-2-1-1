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
    await page.waitForTimeout(24);
  }
}

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: '달의 형성 과정 보기' }).click();
await page.waitForSelector('canvas[data-formation-canvas="true"]', { timeout: 10000 });
await page.waitForFunction(() => !document.querySelector('.formation-loading'), undefined, { timeout: 10000 });
await page.getByRole('button', { name: '다음 단계' }).click();
await page.waitForTimeout(80);

const frames = [
  ['contact-0.48', 27],
  ['dust-peak-0.54', 30],
  ['dust-peak-0.60', 34],
  ['compression-0.66', 37],
  ['excavation-0.72', 40],
  ['burial-0.84', 47],
  ['residual-0.96', 54],
];
let completed = 0;
for (const [name, targetTick] of frames) {
  await tick(targetTick - completed);
  completed = targetTick;
  await page.screenshot({ path: `/tmp/moon-impact-${name}.png`, fullPage: true });
}

console.log(JSON.stringify({ frames, consoleErrors, pageErrors, failedRequests }, null, 2));
await browser.close();
if (consoleErrors.length || pageErrors.length || failedRequests.length) process.exitCode = 1;
