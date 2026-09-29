# Headless balance runner (npm run sim)

**Milestone:** M2 Economy, shop and AI  
**Labels:** feature, tooling

`npm run sim -- --games 500 [--seed N]` plays AI-vs-AI matches and prints:

- win rate by side (target: neither above 55%)
- average match length in rounds
- how often each piece and star level appears in winning armies

Add a CI test running 200 mirrored games that fails above 55% for either side.
