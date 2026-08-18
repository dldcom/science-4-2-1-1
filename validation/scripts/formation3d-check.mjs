import { chromium } from 'playwright-core';

const FORMATION_ASSET_NAMES = [
  'moon-color-2k.jpg',
  'moon-early-crust-2k.webp',
  'moon-basalt-2k.webp',
  'moon-height-2k.webp',
  'moon-early-crust-height-2k.webp',
  'moon-basin-mask-2k.webp',
  'moon-cracks-2k.webp',
  'moon-lava-arrival-2k.webp',
  'moon-crater-decal-512.webp',
  'moon-meteor-256.webp',
  'moon-meteor-normal-256.webp',
  'moon-meteor-roughness-256.webp',
  'moon-meteor-trail-256.webp',
  'moon-impact-shockwave-256.webp',
  'moon-impact-flash-256.webp',
  'moon-impact-dust-256.webp',
];
const baseUrl = process.env.APP_URL || 'http://127.0.0.1:5174/';
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader'],
});
const result = {
  checks: [],
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
};
const check = (name, passed, detail = '') => result.checks.push({ name, passed, detail });

async function installFormationTicker(page) {
  await page.addInitScript(() => {
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
    window.__tickFormation = (count = 1) => {
      for (let index = 0; index < count; index += 1) {
        intervals.filter((entry) => entry.active && (entry.delay === 50 || entry.delay === 180)).forEach((entry) => entry.callback(...entry.args));
      }
    };
  });
}

async function tickFormation(page, count = 1) {
  for (let index = 0; index < count; index += 1) {
    await page.evaluate(() => window.__tickFormation());
    await page.waitForTimeout(8);
  }
}

async function clickNextStage(page) {
  await page.getByRole('button', { name: '다음 단계' }).click();
  await page.waitForTimeout(80);
}

async function watchPage(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') result.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  page.on('requestfailed', (request) => result.failedRequests.push(`${request.url()} :: ${request.failure()?.errorText || 'failed'}`));
}

async function pageSize(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
}

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await installFormationTicker(page);
await watchPage(page);
await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=달의 형성 과정 보기');
const initialResources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
check('formation entry is visible', await page.getByRole('button', { name: '달의 형성 과정 보기' }).count() === 1);
check('formation assets are lazy on start', !initialResources.some((url) => url.includes('/assets/moon-formation/') || url.includes('/node_modules/.vite/deps/three')));

await page.getByRole('button', { name: '달의 형성 과정 보기' }).click();
await page.waitForSelector('.formation-screen', { timeout: 10000 });
await page.waitForSelector('canvas[data-formation-canvas="true"]', { timeout: 10000 });
await page.waitForFunction(() => !document.querySelector('.formation-loading'), undefined, { timeout: 10000 });
const formationResources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
check('formation screen renders', await page.locator('.formation-screen').count() === 1);
check('three.js canvas is created', await page.locator('canvas[data-formation-canvas="true"]').count() === 1);
check('3D canvas has an accessible label', await page.locator('canvas[data-formation-canvas="true"]').getAttribute('aria-label') === '달 표면 형성 과정 3D 시뮬레이션');
check('formation flow has an accessible label', await page.locator('.formation-flow').getAttribute('aria-label') === '달의 형성 흐름');
check('formation flow explains the cause and effect', await page.locator('.formation-flow').innerText().then((text) => text.includes('큰 충돌') && text.includes('큰 웅덩이') && text.includes('용암이 채움') && text.includes('달의 바다')));
check('NASA formation assets load on entry', FORMATION_ASSET_NAMES.every((name) => formationResources.some((url) => url.endsWith(`/assets/moon-formation/${name}`))));
check('smooth phase starts first', await page.locator('.formation-stage__topline b').innerText() === '처음의 달');
check('smooth phase shows geological time', await page.locator('.formation-stage__meta small').innerText().then((text) => text.includes('45억')));
await page.waitForTimeout(1200);
check('formation waits for the next-step button', await page.locator('.formation-stage__topline b').innerText() === '처음의 달' && await page.getByRole('button', { name: '다음 단계' }).count() === 1);
check('formation desktop has no overflow', await pageSize(page).then((size) => size.scrollWidth <= size.clientWidth + 1 && size.scrollHeight <= size.clientHeight + 1), JSON.stringify(await pageSize(page)));

const canvasBox = await page.locator('canvas[data-formation-canvas="true"]').boundingBox();
if (canvasBox) {
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.62, canvasBox.y + canvasBox.height * 0.46, { steps: 8 });
  await page.mouse.up();
}
check('3D canvas accepts pointer interaction', await page.locator('canvas[data-formation-canvas="true"]').evaluate((canvas) => canvas.style.cursor === 'grab'));

await clickNextStage(page);
check('first impact phase begins', await page.locator('.formation-stage__topline b').innerText().then((text) => text.startsWith('충돌')));
check('impact phase shows simplified time', await page.locator('.formation-stage__meta small').innerText().then((text) => text.includes('44~42억')));
check('impact approach has its own explanation', await page.locator('.formation-modal').innerText().then((text) => text.includes('여러 운석') && text.includes('날아와요')));
await tickFormation(page, 30);
check('impact contact changes the explanation', await page.locator('.formation-modal').innerText().then((text) => text.includes('큰 운석') && text.includes('웅덩이')));
await tickFormation(page, 26);
await page.waitForTimeout(80);
for (let index = 1; index < 4; index += 1) {
  await clickNextStage(page);
  await tickFormation(page, 56);
  await page.waitForTimeout(80);
}
await clickNextStage(page);
await page.waitForFunction(() => document.querySelector('.formation-stage__topline b')?.innerText === '용암이 흐르는 때', undefined, { timeout: 10000 });
check('volcanism phase is reached', await page.locator('.formation-stage__topline b').innerText() === '용암이 흐르는 때');
check('volcanism phase shows simplified time', await page.locator('.formation-stage__meta small').innerText().then((text) => text.includes('42~12억')));
check('volcanism explanation is visible', await page.locator('.formation-modal').innerText().then((text) => text.includes('웅덩이') && text.includes('용암이')));
check('volcanism explanation mentions fractures', await page.locator('.formation-modal').innerText().then((text) => text.includes('갈라진 틈')));
await tickFormation(page, 84);
await page.waitForTimeout(80);
await clickNextStage(page);
await page.waitForFunction(() => document.querySelector('.formation-stage__topline b')?.innerText.startsWith('뒤이은 충돌'), undefined, { timeout: 10000 });
check('final impact phase is reached', await page.locator('.formation-stage__topline b').innerText().then((text) => text.startsWith('뒤이은 충돌')));
check('final impact phase shows simplified time', await page.locator('.formation-stage__meta small').innerText().then((text) => text.includes('12억')));
await tickFormation(page, 56);
await page.waitForTimeout(80);
for (let index = 1; index < 3; index += 1) {
  await clickNextStage(page);
  await tickFormation(page, 56);
  await page.waitForTimeout(80);
}
await clickNextStage(page);
await page.waitForFunction(() => document.querySelector('.formation-stage__topline b')?.innerText === '현재의 달', undefined, { timeout: 10000 });
check('summary phase is reached', await page.locator('.formation-stage__topline b').innerText() === '현재의 달');
check('summary explanation is visible', await page.locator('.formation-modal').innerText().then((text) => text.includes('달의 바다는 물이 아니에요') && text.includes('식은 용암')));

await page.getByRole('button', { name: '현재 달 관찰하기' }).click();
await page.waitForSelector('.game-shell', { timeout: 10000 });
await page.waitForSelector('.openseadragon-container', { timeout: 10000 });
check('formation transitions to existing observer', await page.locator('.openseadragon-container').count() === 1 && await page.locator('canvas[data-formation-canvas="true"]').count() === 0);
await page.waitForTimeout(900);
const observerResources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
check('observer begins tile loading after transition', observerResources.some((url) => url.includes('/assets/moon-tiles/')));
for (let index = 0; index < 9; index += 1) {
  await page.getByRole('button', { name: '확대', exact: true }).click();
  await page.waitForTimeout(350);
}
await page.waitForFunction(() => {
  const urls = performance.getEntriesByType('resource').map((entry) => entry.name);
  return urls.some((url) => /moon-tiles\/14\//.test(url));
}, undefined, { timeout: 12000 }).catch(() => {});
const levels = [...new Set(observerResources.concat(await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name))).map((url) => url.match(/moon-tiles\/(\d+)\//)?.[1]).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
check('existing observer still reaches 16K level 14', levels.includes('14'), JSON.stringify(levels));

await page.screenshot({ path: '/tmp/moon-formation-check-desktop.png', fullPage: true });

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await installFormationTicker(mobile);
await watchPage(mobile);
await mobile.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await mobile.getByRole('button', { name: '달의 형성 과정 보기' }).click();
await mobile.waitForSelector('.formation-screen', { timeout: 10000 });
await mobile.waitForSelector('canvas[data-formation-canvas="true"]', { timeout: 10000 });
await mobile.waitForTimeout(900);
const mobileSize = await pageSize(mobile);
check('formation mobile has no horizontal overflow', mobileSize.scrollWidth <= mobileSize.clientWidth + 1, JSON.stringify(mobileSize));
check('formation mobile has no body overflow', mobileSize.scrollHeight <= mobileSize.clientHeight + 1, JSON.stringify(mobileSize));
await mobile.screenshot({ path: '/tmp/moon-formation-check-mobile.png', fullPage: true });

const direct = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await watchPage(direct);
await direct.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await direct.getByRole('button', { name: '현재 달 바로 관찰하기' }).click();
await direct.waitForSelector('.openseadragon-container', { timeout: 10000 });
const directResources = await direct.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
check('direct observer path skips formation chunk and assets', !directResources.some((url) => url.includes('/assets/moon-formation/') || url.includes('/node_modules/.vite/deps/three')));

const reduced = await browser.newPage({ viewport: { width: 390, height: 844 } });
await installFormationTicker(reduced);
await watchPage(reduced);
await reduced.emulateMedia({ reducedMotion: 'reduce' });
await reduced.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await reduced.getByRole('button', { name: '달의 형성 과정 보기' }).click();
await reduced.waitForSelector('canvas[data-formation-canvas="true"]', { timeout: 10000 });
for (let index = 0; index < 9; index += 1) {
  await reduced.waitForTimeout(80);
  await reduced.getByRole('button', { name: '다음 단계' }).click();
  await reduced.waitForTimeout(30);
  await reduced.evaluate(() => window.__tickFormation());
}
await reduced.waitForFunction(() => document.querySelector('.formation-stage__topline b')?.innerText === '현재의 달', undefined, { timeout: 2000 });
const reducedSize = await pageSize(reduced);
check('reduced-motion reaches the summary', await reduced.locator('.formation-stage__topline b').innerText() === '현재의 달');
check('reduced-motion status is shown', await reduced.locator('.formation-stage__footer').innerText().then((text) => text.includes('움직임 줄임')));
check('reduced-motion mobile has no horizontal overflow', reducedSize.scrollWidth <= reducedSize.clientWidth + 1, JSON.stringify(reducedSize));

const fallback = await browser.newPage({ viewport: { width: 390, height: 844 } });
await watchPage(fallback);
await fallback.addInitScript(() => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
    return originalGetContext.call(this, type, ...args);
  };
});
await fallback.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await fallback.getByRole('button', { name: '달의 형성 과정 보기' }).click();
await fallback.waitForSelector('.formation-screen--fallback', { timeout: 10000 });
check('WebGL fallback screen renders', await fallback.locator('.formation-screen--fallback').count() === 1);
check('WebGL fallback keeps observer action', await fallback.getByRole('button', { name: '현재 달 관찰하기' }).count() === 1);

await browser.close();
console.log(JSON.stringify(result, null, 2));
if (result.pageErrors.length || result.consoleErrors.length || result.failedRequests.length || result.checks.some((item) => !item.passed)) process.exitCode = 1;
