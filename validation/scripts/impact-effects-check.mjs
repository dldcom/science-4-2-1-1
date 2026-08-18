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
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => failedRequests.push(`${request.url()} :: ${request.failure()?.errorText || 'failed'}`));

async function stage() {
  return page.evaluate(() => ({
    label: document.querySelector('.formation-stage__topline b')?.textContent || '',
    progress: document.querySelector('.formation-immersive__progress > span')?.style.width || '',
  }));
}
async function tick(count) {
  for (let index = 0; index < count; index += 1) {
    await page.evaluate(() => window.__tickFormation());
    await page.waitForTimeout(25);
  }
}

async function waitForFormationCanvas(targetPage) {
  await targetPage.waitForFunction(() => {
    const canvas = document.querySelector('canvas[data-formation-canvas="true"]');
    if (!canvas || !canvas.isConnected) return false;
    const rect = canvas.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }, undefined, { timeout: 10000 });
}

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: '달의 형성 과정 보기' }).click();
await waitForFormationCanvas(page);
await page.waitForFunction(() => !document.querySelector('.formation-loading'), undefined, { timeout: 10000 });
await page.screenshot({ path: '/tmp/moon-impact-final-initial.png', fullPage: true });

await page.getByRole('button', { name: '다음 단계' }).click();
await page.waitForTimeout(80);
await tick(10); // impactProgress ≈ 0.18: approach / flight
const flight = await stage();
await page.screenshot({ path: '/tmp/moon-impact-final-flight.png', fullPage: true });
await tick(20); // impactProgress ≈ 0.54: contact burst
const contact = await stage();
await page.screenshot({ path: '/tmp/moon-impact-final-contact.png', fullPage: true });
await tick(20); // impactProgress ≈ 0.90: transient effects settling
const after = await stage();
await page.screenshot({ path: '/tmp/moon-impact-final-after.png', fullPage: true });

const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
await mobileContext.addInitScript(() => {
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
const mobile = await mobileContext.newPage();
mobile.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`mobile: ${message.text()}`); });
mobile.on('pageerror', (error) => pageErrors.push(`mobile: ${error.message}`));
await mobile.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await mobile.getByRole('button', { name: '달의 형성 과정 보기' }).click();
await waitForFormationCanvas(mobile);
await mobile.waitForFunction(() => !document.querySelector('.formation-loading'), undefined, { timeout: 10000 });
await mobile.getByRole('button', { name: '다음 단계' }).click();
await mobile.waitForTimeout(80);
for (let index = 0; index < 6; index += 1) {
  await mobile.evaluate(() => window.__tickFormation());
  await mobile.waitForTimeout(25);
}
await mobile.screenshot({ path: '/tmp/moon-impact-final-mobile-contact.png', fullPage: true });
const mobileSize = await mobile.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  scrollHeight: document.documentElement.scrollHeight,
  clientHeight: document.documentElement.clientHeight,
}));

const result = {
  stages: { flight, contact, after },
  mobileSize,
  consoleErrors,
  pageErrors,
  failedRequests,
};
await browser.close();
console.log(JSON.stringify(result, null, 2));
if (consoleErrors.length || pageErrors.length || failedRequests.length) process.exitCode = 1;
