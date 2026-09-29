/**
 * Preload the art before the first frame and drive the loading screen.
 *
 * Images are fetched into the browser cache, so the sprites the renderer asks
 * for later are already there. If anything is slow or fails, the game starts
 * anyway and uses its fallbacks (Unicode glyphs for pieces).
 */
import { assetUrls, preloadAssets } from './assets.ts';
import type { PreloadResult } from './assets.ts';

/** Stop waiting for art after this long. */
export const PRELOAD_TIMEOUT_MS = 5000;

function loadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve(true);
    };
    image.onerror = () => {
      resolve(false);
    };
    image.src = url;
  });
}

/** Load all art, updating the `#loading` element if there is one, then hide it. */
export async function preloadArt(): Promise<PreloadResult> {
  const screen = document.getElementById('loading');
  const label = screen?.querySelector('.count');
  const result = await preloadAssets(assetUrls(), loadImage, PRELOAD_TIMEOUT_MS, (done, total) => {
    if (label) label.textContent = `${String(done)} / ${String(total)}`;
  });
  if (screen) screen.hidden = true;
  return result;
}
