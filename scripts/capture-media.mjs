// Captures the demo screenshots (and optional GIF frames) from a running build.
// Needs Playwright and a Chromium: it is not a project dependency.
//   npm run build && npx vite preview --port 4173 &
//   NODE_PATH=$(npm root -g) node scripts/capture-media.mjs [--frames]
// Env: BASE_URL (default http://localhost:4173/), CHROMIUM (path to the browser binary).
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = 'docs/media';
const FRAMES = process.argv.includes('--frames');
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const SETTLE_MS = 600;
const FIGHT_SHOT_MS = 900;
const FRAME_MS = 100;
const FRAME_COUNT = 40;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });

async function open(viewport, isMobile) {
  const page = await browser.newPage({ viewport, isMobile, hasTouch: isMobile });
  await page.goto(BASE_URL);
  await page.waitForTimeout(SETTLE_MS);
  return page;
}

async function click(page, text) {
  await page.getByRole('button', { name: text }).first().click();
  await page.waitForTimeout(SETTLE_MS);
}

async function buyFirstCards(page, count) {
  const cards = page.locator('.card');
  for (let i = 0; i < count; i++) {
    await cards
      .nth(i)
      .click()
      .catch(() => {});
    await page.waitForTimeout(200);
  }
}

async function play(name, viewport, isMobile) {
  const page = await open(viewport, isMobile);
  if (name === 'desktop') await page.screenshot({ path: `${OUT}/01-title.png` });
  await click(page, 'Play vs AI');
  await buyFirstCards(page, 3);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/${name === 'desktop' ? '02' : '04'}-prep-${name}.png` });
  await click(page, 'Fight');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(FIGHT_SHOT_MS);
  await page.screenshot({ path: `${OUT}/${name === 'desktop' ? '03' : '05'}-fight-${name}.png` });
  if (FRAMES && name === 'desktop') {
    await click(page, '2×');
    for (let i = 0; i < FRAME_COUNT; i++) {
      await page.screenshot({ path: `${OUT}/frames/fight-${String(i).padStart(3, '0')}.png` });
      await page.waitForTimeout(FRAME_MS);
    }
  }
  await page.close({ runBeforeUnload: false });
}

if (FRAMES) mkdirSync(`${OUT}/frames`, { recursive: true });
await play('desktop', DESKTOP, false);
await play('phone', PHONE, true);
await browser.close();
console.log(`Screenshots written to ${OUT}/`);
