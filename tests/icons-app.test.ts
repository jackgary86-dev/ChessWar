import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pub = (path: string): Buffer => readFileSync(new URL(`../public/${path}`, import.meta.url));
const PNG_SIGNATURE = '89504e470d0a1a0a';
const WIDTH_AT = 16;
const HEIGHT_AT = 20;

function pngSize(path: string): [number, number] {
  const data = pub(path);
  expect(data.subarray(0, 8).toString('hex'), path).toBe(PNG_SIGNATURE);
  return [data.readUInt32BE(WIDTH_AT), data.readUInt32BE(HEIGHT_AT)];
}

describe('favicon and app icons', () => {
  it('has PNGs at the sizes the ticket names', () => {
    const sizes: Record<string, number> = {
      'favicon-16.png': 16,
      'favicon-32.png': 32,
      'favicon-48.png': 48,
      'apple-touch-icon.png': 180,
      'icons/icon-192.png': 192,
      'icons/icon-512.png': 512,
      'icons/maskable-192.png': 192,
      'icons/maskable-512.png': 512,
    };
    for (const [path, size] of Object.entries(sizes)) expect(pngSize(path)).toEqual([size, size]);
  });

  it('bundles 16, 32 and 48 px images in favicon.ico', () => {
    const ico = pub('favicon.ico');
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    expect([0, 1, 2].map((i) => ico.readUInt8(6 + i * 16))).toEqual([16, 32, 48]);
  });

  it('lists every app icon in the web manifest, including maskable ones', () => {
    const manifest = JSON.parse(pub('manifest.webmanifest').toString('utf8')) as {
      name: string;
      icons: { src: string; sizes: string; purpose: string }[];
    };
    expect(manifest.name).toBe('Chess War');
    for (const icon of manifest.icons) {
      const [w] = icon.sizes.split('x').map(Number);
      expect(pngSize(icon.src)[0]).toBe(w);
    }
    const maskable = manifest.icons.filter((i) => i.purpose === 'maskable').map((i) => i.sizes);
    expect(maskable).toEqual(['192x192', '512x512']);
    expect(manifest.icons.some((i) => i.purpose === 'any' && i.sizes === '512x512')).toBe(true);
  });

  it('links them from index.html', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    for (const needle of [
      'rel="manifest"',
      'rel="apple-touch-icon"',
      'favicon.svg',
      'favicon.ico',
    ]) {
      expect(html).toContain(needle);
    }
  });
});
