# Release checklist

- Record exact commit (`git rev-parse HEAD`), seed, Node/browser and test commands.
- `npm ci && npm ci --prefix server && npm run test:ci`
- `npx playwright install chromium && npm run test:browser`
- Review deterministic offline/server parity, input cancellation, cover and inventory negatives.
- Record human desktop, Android and iPhone separately; automated emulation is not device acceptance.
- Record load bytes and p50/p95 frame timings with device, quality and seed. No FPS claim without measurement.
- Owner review is required before merge, Pages deployment or service activation.
