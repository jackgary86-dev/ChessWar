import { readdirSync, statSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PIECE_ORDER } from '../src/sim/data.ts';
import {
  assetPaths,
  assetUrl,
  iconAssetPath,
  pieceAssetPath,
  preloadAssets,
} from '../src/ui/assets.ts';

const ART_BUDGET_BYTES = 2 * 1024 * 1024;
const ROOT = new URL('../assets/', import.meta.url);

function sizeOf(dir: URL): number {
  return readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    return sum + (entry.isDirectory() ? sizeOf(child) : statSync(child).size);
  }, 0);
}

describe('asset registry', () => {
  it('finds every piece sprite and icon by naming convention', () => {
    for (const type of PIECE_ORDER) {
      for (const side of [0, 1] as const) {
        expect(assetUrl(pieceAssetPath(type, side)), `${type}${String(side)}`).toBeTypeOf('string');
      }
    }
    expect(assetUrl(iconAssetPath('gold'))).toBeTypeOf('string');
    expect(assetPaths()).toContain('brand/logo-mark.svg');
  });

  it('returns undefined for an unknown asset so callers can fall back', () => {
    expect(assetUrl('pieces/X-ivory.svg')).toBeUndefined();
  });

  it('stays under the 2 MB first-load art budget', () => {
    expect(sizeOf(ROOT)).toBeLessThan(ART_BUDGET_BYTES);
  });
});

describe('preloadAssets', () => {
  it('reports failures and never rejects', async () => {
    const progress = vi.fn();
    const result = await preloadAssets(
      ['a', 'b', 'c'],
      (url) =>
        url === 'b'
          ? Promise.resolve(false)
          : url === 'c'
            ? Promise.reject(new Error('x'))
            : Promise.resolve(true),
      1000,
      progress,
    );
    expect(result).toEqual({ total: 3, failed: ['b', 'c'], timedOut: false });
    expect(progress).toHaveBeenLastCalledWith(3, 3);
  });

  it('gives up on slow assets after the timeout', async () => {
    const result = await preloadAssets(['slow'], () => new Promise<boolean>(() => undefined), 10);
    expect(result.timedOut).toBe(true);
  });
});
