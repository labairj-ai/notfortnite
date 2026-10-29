# NF-010 — Establish gameplay regression and release certification

Status: **IMPLEMENTED — PLAYTEST ACCEPTANCE PENDING**<br>
Priority: **P0 / foundation**  
Release: **0 — test foundation**  
Dependencies: **None**  
Primary code: `package.json`, `shared/match.js`, `src/controls.js`, `src/world.js`, `.github/workflows/deploy.yml`

## Problem / current evidence

The current package defines dev/build/preview but no test command. The repository tree contains no automated gameplay tests, and the deployment workflow targets GitHub Pages. Subsequent control, collision, bot, and networking changes need observable regression gates before implementation.

## Implementation steps

- [ ] Select a small JavaScript test runner compatible with ESM/Node and add `npm test` plus a non-mutating CI test command; document how to execute locally.
- [ ] Extract pure or dependency-injected helpers only where necessary so control transitions, inventory operations, hit geometry and storm/bot simulation can be tested without a WebGL browser.
- [ ] Establish deterministic world seeds and mock clocks, inputs, random generators and network messages; retain known seeds as regression fixtures.
- [ ] Add browser smoke scenarios: menu → offline start → landing → loot → firing → building → elimination/end → play again; add simple online local-server smoke with two clients.
- [ ] Add a release checklist and machine-readable evidence artifact for build SHA, tests, browser smoke, no-replay-desync, performance baseline and physical-device signoff.
- [ ] Configure CI to block release for failing tests/build while retaining manual owner review for deployment/promotion.

## Acceptance criteria

- [ ] `npm test` is available and exits nonzero on an intentional test failure.
- [ ] At least one passing and one deliberately failing fixture demonstrate each test category: deterministic match, local controls/cancellation, loot/inventory and hit/world collision.
- [ ] Offline and server match fixtures produce equivalent storm and bot outcomes for the same input schedule/seed (excluding documented ID/timing differences).
- [ ] Release evidence clearly distinguishes automated PASS from Android/iPhone/desktop human acceptance NOT RUN.
- [ ] CI reports test/build results for PRs; no automation merges or deploys changes without existing release policy checks.

## Automated regression tests

- [ ] Include deterministic replay and seed snapshots; avoid flaky wall-clock sleeps and random assertions.
- [ ] Cover zero/negative values, malformed network messages, build collision edge cases and player death/respawn cleanup.
- [ ] Add a browser smoke runner using local assets; gracefully skip physical device-only checks with explicit NOT TESTED status.

## Human QA / devices

- [ ] Collect a baseline run on one Android phone, one iPhone and one desktop browser when accessible; otherwise mark devices pending.
- [ ] Record initial FPS, start-to-interactive, controls usability, first-loot time and one complete-match trace; do not invent values.
- [ ] Verify `npm run build` and existing GitHub Pages deployment configuration remain functional.

## Engineering guardrails

- [ ] No gameplay tuning as a side effect of framework adoption; no new telemetry to third parties.
- [ ] Keep gameplay simulation authoritative to intended host; offline mode must remain fully functional without a server.
- [ ] Protect the current main branch: documentation and implementation go through reviewed PRs.
- [ ] Other NF tasks may start once a minimal test harness is in place; expand certification scenarios continuously without making this a circular dependency.

## Definition of done

Code and tests are committed together; local build and all available automated checks pass; any changed shared simulation behavior is verified in both offline and online modes; a focused mobile/desktop playtest receipt identifies tested browser/device, build SHA, observed behavior, known limitations, and remaining risk. Open a review PR; do **not** merge, deploy, or declare physical-device acceptance on behalf of the owner.

## Implementation review receipt

Source implementation is prepared in the reviewed PR stack; see [the implementation matrix](../docs/BACKLOG-IMPLEMENTATION.md) and [machine-readable evidence](../docs/release-evidence.json). Automated results are recorded separately from human and physical-device acceptance. Original acceptance checkboxes remain open wherever the complete original criterion has not been independently certified. The owner subsequently requested a direct source push. This task remains open for human/device acceptance; publishing does not grant physical certification.
