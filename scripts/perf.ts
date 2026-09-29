/**
 * Performance bug check (npm run perf): sim speed, frame cost, memory growth and
 * first-load size. Exits 1 when a budget is missed. Run `npm run build` first for
 * the load-size line. The real-phone 60 fps and Wi-Fi load checks are in docs/PERFORMANCE.md.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { setFlagsFromString } from 'node:v8';
import { gzipSync } from 'node:zlib';

import { playAiMatch } from '../src/sim/match.ts';
import {
  FRAME_BUDGET_MS,
  FULL_BOARD_PIECES,
  settledHeap,
  simMs,
  worstFrameMs,
} from '../tests/helpers/perf.ts';

const SIM_GAMES = 500;
const SIM_BUDGET_MS = 60_000;
const MEMORY_MATCHES = 300;
const MEMORY_WARMUP = 50;
const MEMORY_GROWTH_LIMIT_BYTES = 8 * 1024 * 1024;
/** Home Wi-Fi is taken as 10 Mbit/s with 100 ms latency; the load budget is 3 s. */
const WIFI_BYTES_PER_MS = (10 * 1_000_000) / 8 / 1000;
const WIFI_LATENCY_MS = 100;
const LOAD_BUDGET_MS = 3000;
const DIST = 'dist';

const failures: string[] = [];
const report = (name: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
  if (!ok) failures.push(name);
};

const sim = simMs(SIM_GAMES);
report(
  'sim speed',
  sim < SIM_BUDGET_MS,
  `${String(SIM_GAMES)} games in ${(sim / 1000).toFixed(1)} s (budget 60 s)`,
);

const frame = worstFrameMs();
report(
  'frame build',
  frame < FRAME_BUDGET_MS / 2,
  `worst frameAt with ${String(FULL_BOARD_PIECES)} pieces ${frame.toFixed(2)} ms (budget ${(FRAME_BUDGET_MS / 2).toFixed(1)} ms, half a 60 fps frame)`,
);

setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;
for (let i = 0; i < MEMORY_WARMUP; i++) playAiMatch({ seed: i });
const before = settledHeap(gc) ?? 0;
for (let i = 0; i < MEMORY_MATCHES; i++) playAiMatch({ seed: MEMORY_WARMUP + i });
const growth = (settledHeap(gc) ?? 0) - before;
report(
  'memory growth',
  growth < MEMORY_GROWTH_LIMIT_BYTES,
  `${(growth / 1024).toFixed(0)} KiB after ${String(MEMORY_MATCHES)} matches (limit ${String(MEMORY_GROWTH_LIMIT_BYTES / 1024)} KiB)`,
);

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
try {
  // First load fetches the page, its CSS and its JS; art loads afterwards.
  const shell = files(DIST).filter((f) => /index.*\.(html|css|js)$/.test(f));
  const bytes = shell.reduce((sum, f) => sum + gzipSync(readFileSync(f)).length, 0);
  const ms = WIFI_LATENCY_MS * 2 + bytes / WIFI_BYTES_PER_MS;
  report(
    'first load',
    ms < LOAD_BUDGET_MS,
    `${String(bytes)} B gzipped, about ${ms.toFixed(0)} ms on 10 Mbit/s (budget 3000 ms)`,
  );
} catch {
  report('first load', false, `no ${DIST}/ folder; run npm run build first`);
}

process.exitCode = failures.length > 0 ? 1 : 0;
