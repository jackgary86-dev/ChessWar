/**
 * The art asset registry. Every SVG under `assets/` is picked up by a glob, so
 * adding or swapping a file needs no code change: piece sprites are looked up
 * by the naming convention in `assets/README.md`, and a missing file simply
 * makes the caller fall back (the Unicode glyph for pieces, no icon for icons).
 */
import type { PieceType, Side } from '@sim/types.ts';

const FILES = import.meta.glob<string>('../../assets/**/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

const ASSETS_DIR = 'assets/';

/** Registered urls by path inside `assets/`, e.g. `pieces/P-ivory.svg`. */
const BY_PATH: ReadonlyMap<string, string> = new Map(
  Object.entries(FILES).map(([path, url]) => [
    path.slice(path.indexOf(ASSETS_DIR) + ASSETS_DIR.length),
    url,
  ]),
);

const SIDE_NAMES: readonly [string, string] = ['ivory', 'ebony'];

/** Path of a piece sprite: `pieces/<type>-<side>.svg`. */
export function pieceAssetPath(type: PieceType, side: Side): string {
  return `pieces/${type}-${SIDE_NAMES[side]}.svg`;
}

/** Path of a UI icon: `icons/<name>.svg`. */
export function iconAssetPath(name: string): string {
  return `icons/${name}.svg`;
}

/** Url of an asset by its path inside `assets/`, or undefined if there is no such file. */
export function assetUrl(path: string): string | undefined {
  return BY_PATH.get(path);
}

/** Every registered asset path. */
export function assetPaths(): string[] {
  return [...BY_PATH.keys()];
}

/** Every registered asset url, for preloading. */
export function assetUrls(): string[] {
  return [...BY_PATH.values()];
}

export interface PreloadResult {
  readonly total: number;
  readonly failed: readonly string[];
  readonly timedOut: boolean;
}

/**
 * Load every url with `load` (true when it loaded), resolving when all have
 * settled or after `timeoutMs`, whichever is first. Never rejects: the game
 * starts either way, and a failed asset just uses its fallback.
 */
export async function preloadAssets(
  urls: readonly string[],
  load: (url: string) => Promise<boolean>,
  timeoutMs: number,
  onProgress?: (done: number, total: number) => void,
): Promise<PreloadResult> {
  const failed: string[] = [];
  let done = 0;
  const all = Promise.all(
    urls.map(async (url) => {
      const ok = await load(url).catch(() => false);
      if (!ok) failed.push(url);
      done += 1;
      onProgress?.(done, urls.length);
    }),
  ).then(() => false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      resolve(true);
    }, timeoutMs);
  });
  const timedOut = await Promise.race([all, timeout]);
  clearTimeout(timer);
  return { total: urls.length, failed: [...failed], timedOut };
}
