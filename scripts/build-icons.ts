/**
 * Generate the favicon and app icons in `public/` from the logo mark
 * (npm run icons). Rasterizing needs Playwright with a Chromium browser (not a
 * project dependency: install it globally and set NODE_PATH, and CHROMIUM if the
 * browser is not in Playwright's default location). The outputs are committed,
 * so a normal build never needs this.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const MARK = readFileSync(join(root, 'assets/brand/logo-mark.svg'), 'utf8');
const INNER =
  /<svg[^>]*>([\s\S]*)<\/svg>/.exec(MARK)?.[1]?.replace(/<title>.*?<\/title>/s, '') ?? '';
const GROUND = '#1e1b15';

/** The mark alone, on a transparent ground (favicon, "any" purpose icons). */
const anySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${INNER}</svg>`;

/**
 * Full-bleed ground with the mark inside the safe zone: maskable icons may be
 * cropped to a circle, so the mark takes 60% of the width. The 180 px Apple
 * icon uses the same file, since iOS applies its own corner mask.
 */
const SAFE_SCALE = 0.6;
const fullBleedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${GROUND}"/><g transform="translate(${String(32 - 32 * SAFE_SCALE)} ${String(32 - 32 * SAFE_SCALE)}) scale(${String(SAFE_SCALE)})">${INNER}</g></svg>`;

const outputs: { file: string; svg: string; size: number }[] = [
  { file: 'favicon-16.png', svg: anySvg, size: 16 },
  { file: 'favicon-32.png', svg: anySvg, size: 32 },
  { file: 'favicon-48.png', svg: anySvg, size: 48 },
  { file: 'icons/icon-192.png', svg: anySvg, size: 192 },
  { file: 'icons/icon-512.png', svg: anySvg, size: 512 },
  { file: 'icons/maskable-192.png', svg: fullBleedSvg, size: 192 },
  { file: 'icons/maskable-512.png', svg: fullBleedSvg, size: 512 },
  { file: 'apple-touch-icon.png', svg: fullBleedSvg, size: 180 },
];

/** The slice of Playwright this script uses; it is not a project dependency. */
interface Browser {
  newPage: (options: { viewport: { width: number; height: number } }) => Promise<Page>;
  close: () => Promise<void>;
}
interface Page {
  setContent: (html: string) => Promise<void>;
  screenshot: (options: { omitBackground: boolean; path: string }) => Promise<unknown>;
  close: () => Promise<void>;
}

/** Launch Chromium through Playwright, which must be installed globally (set NODE_PATH) or locally. */
async function launch(): Promise<Browser> {
  // createRequire, unlike import(), honors NODE_PATH for a global install.
  const pw = createRequire(import.meta.url)('playwright') as {
    chromium: { launch: (options: { executablePath?: string }) => Promise<Browser> };
  };
  const path = process.env.CHROMIUM;
  return pw.chromium.launch(path ? { executablePath: path } : {});
}

async function render(browser: Browser, svg: string, size: number, out: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${String(size)}px;height:${String(size)}px}</style>${svg}`,
  );
  await page.screenshot({ omitBackground: true, path: out });
  await page.close();
}

/** A .ico that wraps PNG images (supported by every current browser). */
function ico(pngs: { size: number; data: Buffer }[]): Buffer {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  const entries = Buffer.alloc(16 * pngs.length);
  let offset = head.length + entries.length;
  pngs.forEach((png, i) => {
    const at = i * 16;
    entries.writeUInt8(png.size, at);
    entries.writeUInt8(png.size, at + 1);
    entries.writeUInt16LE(1, at + 4);
    entries.writeUInt16LE(32, at + 6);
    entries.writeUInt32LE(png.data.length, at + 8);
    entries.writeUInt32LE(offset, at + 12);
    offset += png.data.length;
  });
  return Buffer.concat([head, entries, ...pngs.map((p) => p.data)]);
}

const publicDir = join(root, 'public');
mkdirSync(join(publicDir, 'icons'), { recursive: true });
writeFileSync(join(publicDir, 'favicon.svg'), `${anySvg}\n`);
const browser = await launch();
for (const o of outputs) await render(browser, o.svg, o.size, join(publicDir, o.file));
await browser.close();
const favicons = [16, 32, 48].map((size) => ({
  size,
  data: readFileSync(join(publicDir, `favicon-${String(size)}.png`)),
}));
writeFileSync(join(publicDir, 'favicon.ico'), ico(favicons));
console.log(`Wrote ${String(outputs.length + 2)} icon files to public/`);
