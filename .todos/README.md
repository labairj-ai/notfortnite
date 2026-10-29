# NotFortnite — Playability Backlog

**Created:** 2026-10-28  
**Source baseline:** `main` @ `b9277c7a7a807be487718193f55e98b93e968ad7`  
**Scope:** All ten items have implementation prepared in the review stack. The owner requested a direct main push for this early iteration. Items remain **playtest acceptance pending**, not closed, with no physical-device signoff. See [implementation and evidence](../docs/BACKLOG-IMPLEMENTATION.md).

## Ordered backlog

| ID | Task | Priority | Phase | Dependencies |
|---|---|---|---|---|
| [NF-010](./NF-010-gameplay-regression-certification.md) | Establish gameplay regression and release certification | P0 | 0 | — |
| [NF-001](./NF-001-melee-harvest-hit-origin.md) | Repair melee reach and harvesting | P0 | 1 | 010 |
| [NF-002](./NF-002-shooting-targeting-accuracy.md) | Align crosshair, hit geometry and combat feedback | P0 | 1 | 001,010 |
| [NF-003](./NF-003-touch-input-lifecycle.md) | Prevent stuck controls and stabilize multi-touch | P0 | 1 | 010 |
| [NF-004](./NF-004-customizable-mobile-hud.md) | Configurable mobile combat controls and HUD | P1 | 1 | 003 |
| [NF-005](./NF-005-inventory-swap-drop-stack.md) | Inventory pickup, swap/drop and healing stacks | P1 | 1 | 003,010 |
| [NF-006](./NF-006-bot-navigation-tactics-difficulty.md) | Cover-aware bots and difficulty tiers | P1 | 2 | 001,002,010 |
| [NF-007](./NF-007-casual-match-pacing-telemetry.md) | Measured match pacing and casual mode | P1 | 2 | 005,006,010 |
| [NF-008](./NF-008-offline-combat-training.md) | Offline combat and building training | P1 | 2 | 002,004,010 |
| [NF-009](./NF-009-mobile-assets-performance.md) | Mobile asset loading and performance | P2 | 3 | 004,010 |

## Release stages

- **Phase 0 — Testing baseline:** NF-010. Install minimal deterministic unit/integration/browser smoke test foundation before gameplay mutation. Build/device acceptance remain separate.
- **Phase 1 — Fundamental playability:** NF-001, NF-002, NF-003, NF-004, NF-005. Fix melee and touch correctness, improve targeting and simplify looting. NF-001 and NF-003 may proceed independently after test harness starts.
- **Phase 2 — Engagement:** NF-006, NF-007, NF-008. Upgrade bot behavior, tune casual pacing with real metrics and add training.
- **Phase 3 — Performance:** NF-009. Optimize based on measured mobile performance, preserving existing gameplay.

## Operating rules for the development agent

1. Complete work in small, independent, reviewed PRs; link the NF item in each PR and make status changes only after the changes and evidence meet acceptance criteria.
2. Preserve the offline battle-royale experience and shared browser/server simulation contract. Verify both modes for logic that affects combat, inventory, world state or bots.
3. Keep the 10-player baseline, weapons, material costs and core balance unchanged unless a task explicitly tests and justifies a different rule.
4. Separate **code test PASS**, **desktop browser PASS**, **Android physical PASS**, **iPhone physical PASS**, and **performance acceptance**. Do not mark unperformed human tests passed.
5. Record repository commit SHA, reproducible seed, test command/results, device/browser/build and known failures with each completion receipt.
6. Do not merge into `main`, deploy GitHub Pages or activate any new online service without owner approval.
7. Fix suspected defects with a failing reproduction first where practical. Proposed pacing/FPS values are targets to test, **not existing measured outcomes**.
8. Track dependencies directly in the item Markdown. This repository had no preexisting `.todos/` directory as of the baseline SHA.

## Evidence-based starting points

- `src/main.js`: camera-offset melee targeting; hit acquisition; inventory and placement; update sequence.
- `src/controls.js`: touch lifecycle and look/movement input.
- `shared/match.js`: bot targeting, movement and storm.
- `server/server.js`: client-state, damage, heal, building and pickup authority.
- `src/models.js`: all-character model preloading.
- `package.json`: no test script.

### Owner review gate

**Decision required:** Approve backlog PR to add these planned tasks to `main`? No gameplay changes are included.
