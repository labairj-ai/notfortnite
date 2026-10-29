# Playability implementation and acceptance

Implementation source: `5e256dd` (full SHA in `release-evidence.json`). Baseline: `b9277c7`. The owner requested an early-iteration direct push ("just push"); the implementation is now published to main. Physical-device/human acceptance remains separate.

| Item | Implementation | Automated evidence | Remaining acceptance |
|---|---|---|---|
| NF-010 | Node test runner, deterministic replay, deliberate failure fixtures, PR validation, exact-SHA owner release workflow | 29 unit/integration tests, 15 browser scenarios, build PASS | Owner review; physical/human certification |
| NF-001 | Player-origin, surface-distance melee with a forward cone and cover/terrain checks; once-per-swing server-owned harvest and material feedback | Reach, occlusion, surface boundary, cadence, duplicate-action tests | 20-strike desktop/touch playtests and recordings |
| NF-002 | Current-frame camera aim reconciled to muzzle; shared wall/floor/rotated solid-ramp and body geometry; server-owned weapon damage, cadence, range, aim and inventory; accepted-hit shield/health and direction feedback; F3 diagnostics | Geometry/terrain, forged damage, malformed/non-finite aim, replay and logical delayed-delivery tests | Real mouse/touch precision videos, WAN latency and low-end device checks. Basic movement checks are not full competitive anti-cheat |
| NF-003 | Independent move/look/button pointer IDs; cancel, capture loss, blur, hidden tab, rotation, death, menus and teardown reset; stale online callbacks isolated | Multi-contact cancellation, blur, second-session, online-exit-to-Practice browser tests | Physical Android/iPhone interrupted-gesture and orientation sessions |
| NF-004 | Versioned saved sensitivity/inversion/handedness/joystick/presets/size/opacity; bounded layout editing with collision rejection; optional casual/practice aim assist; aim/fire toggle | Settings validation, persistence/reset, five mobile viewport checks | Physical thumb reach, cutouts, accessibility and preference comparisons |
| NF-005 | Pure stack/drop/swap/heal transactions, protected pickaxe, rarity/damage/cadence comparisons, explicit cancel/replace, server-owned proximity/single-claim/sequence acknowledgment | Full inventory/cancel/swap, stack boundaries, heal caps, independent claimants and duplicate sequences | 20-pickup physical sessions and realistic impaired-network trials |
| NF-006 | Bounded A* with clearance and added/removed cover; difficulty/reaction profiles; loot/search/sound/reposition/attack/cover/heal/storm/retreat decisions; bounded debug traces | Multi-wall route regression, cover rejection, determinism, decision budget | 10 human matches and low-end phone decision/frame-time evaluation; complex user-built mazes still need QA |
| NF-007 | Local allowlisted timings; selectable Casual POI spawns and denser floor loot; Classic unchanged; safe-circle/POI guidance; local summaries and explicit export | 20 world-seed fixtures and 40 full simulated matches; median/p75/outliers retained | Human Casual/Classic trials. Proposed timing targets are evaluated, not established as met |
| NF-008 | Offline deterministic Practice without storm/queue; stationary and moving resettable targets; weapons/heals/build materials, optional eight-step guide, free practice, reset/reposition/exit | Practice action, reset, exit to battle, repeated-session isolation browser tests | First-time mobile onboarding and physical control consistency |
| NF-009 | On-demand nearby/selected models, deduplicated cache, abort/retry on session replacement, procedural fallback, shared asset ownership and skeleton/GPU cleanup; sustained Auto quality and 10Hz HUD | Model cache/failure/abort tests; repeated-session texture regression; cold baseline/candidate model transfer and p50/p95 lab samples | Physical cold/warm/offline/heat/FPS sessions; decoded GPU-memory bytes and GPU stall timing are not available from this runner. No compression/LOD substitution was adopted without evidence |

## Review stack

1. [PR #2 — foundation](https://github.com/labairj-ai/notfortnite/pull/2)
2. [PR #3 — controls](https://github.com/labairj-ai/notfortnite/pull/3)
3. [PR #4 — shared simulation](https://github.com/labairj-ai/notfortnite/pull/4)
4. [PR #5 — settings/quality](https://github.com/labairj-ai/notfortnite/pull/5)
5. [PR #6 — local metrics/Practice state](https://github.com/labairj-ai/notfortnite/pull/6)
6. [Integration PR #7](https://github.com/labairj-ai/notfortnite/pull/7) — connects both hosts, UI, training, on-demand assets, cleanup and expanded acceptance fixtures. Retained as the implementation history; the owner subsequently requested publishing directly to main.

The intermediate library PRs intentionally prepare host-neutral contracts; the final integration PR connects them to both live game hosts. Unit code is formatted in the integration PR for reviewability. Publishing these source changes does not claim physical acceptance.

## Reproduction

`npm ci && npm ci --prefix server && npm run test:ci`; then `npx playwright install chromium && npm run test:browser`. Test seeds include 42; pacing uses 1–20 for both presets. Source IDs/random IDs are excluded where explicitly nondeterministic; ordered decision and storm replay are tested directly.

`node scripts/pacing.mjs` writes its exact implementation SHA and source digests with the simulation. The simulated player begins grounded, follows a scripted nearest-weapon then nearest-opponent policy, uses shared collision/transaction rules, and runs at dt=0.2 with a 420-second cap. This is not an estimate of real human skydiving, survival, enjoyment or match duration.

For `scripts/measure-browser.mjs`, archive baseline `b9277c7` into a separate temporary directory, install/link the same locked dependencies, serve it on port 5174, and serve the candidate on 5175. The script runs local cold touch-emulated Chromium/SwiftShader at 844x390/DPR1/seed42. JSON binds to the source used for the run. The performance measurement at `88fbddf` precedes the late-network-callback isolation and menu-gesture scoping corrections at `afe3aba`/`5ca49e8`. Functional browser tests were rerun for those corrections; the performance numbers apply to the explicitly recorded measurement commit. No physical device or decoded GPU-byte conclusion follows from this measurement.

Historical local failures (pointer-lock rejection, input-observer render dependence, Practice reset progress and retained skeleton textures) were corrected with relevant regressions. PR #6's original CI timeout is retained as a failure; the session-readiness observer was moved out of the animation loop and the subsequent exact-head run passed. No CI result was waived or relabeled.

Original checklists are retained; unperformed human/device criteria remain unchecked. The owner authorized publishing this early iteration. Physical/human acceptance remains pending; the build/browser deployment gate still applies.

The first integration CI runs failed because desktop pointer lock intercepted clicks on Practice controls. Practice now opens with a free cursor, click-to-aim and an Esc hint; the browser fixture exercises Esc before using controls. No assertion, timeout or scenario was removed to bypass that failure.
