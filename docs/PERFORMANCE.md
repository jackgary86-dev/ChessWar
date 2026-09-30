# Performance bug check

Run `npm run build && npm run perf` for the automated half. It exits 1 if a budget is missed.

| Ticket line | Automated check | Result (CI-class machine) |
|---|---|---|
| `npm run sim -- --games 500` under 60 s | `npm run perf` times 500 games; `tests/performance.test.ts` times a 20-game slice | about 38 s |
| 60 fps in combat, 16 pieces | Worst `frameAt` cost with 16 pieces must stay under half a 60 fps frame (8.3 ms) | about 0.6 ms |
| No memory growth over a long match | Heap after forced GC, 300 AI matches after a warm-up, growth under 8 MiB | under 100 KiB |
| First load under 3 s | Gzipped `index.html` + JS + CSS at 10 Mbit/s with 100 ms latency | about 225 ms (32 KB) |

The UI keeps its own growth bounded: the battle log keeps 120 lines (`src/ui/log.ts`) and merge bursts are dropped after their animation (`src/main.ts`).

## Still needs a person

The frame-build number covers only the sim replay, not canvas drawing, which depends on the GPU. On a mid-range phone:

1. Open the built game (`npm run preview`, then the LAN URL) in Chrome; on Android use `chrome://inspect` with the Performance monitor's FPS meter, on iOS Safari use Web Inspector's Timelines.
2. Play a fight with 8 pieces a side at 1x and 4x speed. Frame rate should hold near 60 fps with no long tasks over 50 ms.
3. Play 20 rounds and compare the JS heap (Memory tab, take a snapshot after round 2 and after round 20). Growth should be small and not steady.
4. Load the deployed build on home Wi-Fi with the cache disabled; the piece art should be visible in under 3 s.

Record the phone model and numbers on the issue.
