# NF-007 — Improve battle-royale pacing using measured encounter telemetry

Status: **TODO**  
Priority: **P1 / engagement**  
Release: **2 — engagement**  
Dependencies: **NF-005, NF-006, NF-010**  
Primary code: `shared/constants.js`, `shared/worldgen.js`, `shared/match.js`, `src/main.js`, `src/ui.js`

## Problem / current evidence

The generated world is 512 units across with 10 players; loot and opponents are scattered while the default storm sequence can take several minutes. Long travel or empty early encounters may lower engagement, but no current match telemetry proves the right thresholds.

## Implementation steps

- [ ] Add local, privacy-preserving match metrics: landing, first usable weapon, first opponent sighting, first damage, first elimination, storm deaths, build attempts, placement and duration.
- [ ] Create replayable scripted seeds and test scenarios; compare pacing by world size, spawn distribution, bot density and storm phase, without changing all at once.
- [ ] Introduce a selectable Casual preset with denser points of interest/loot and faster early encounters; keep Classic pacing intact for comparison.
- [ ] Show lightweight storm destination and nearest notable loot/POI guidance without revealing enemy positions.
- [ ] Develop a short post-match summary with engagement events and cause of elimination; keep tracking entirely local unless explicitly enabled.

## Acceptance criteria

- [ ] Baseline and candidate pacing metrics are recorded from real or reproducible simulated matches with methodology included.
- [ ] Proposed Casual targets are evaluated, not asserted as achieved: most players get a weapon ≤20 seconds after landing; first opponent contact 45–60 seconds; typical match 4–6 minutes.
- [ ] Classic preset retains its previous storm and world generation settings by default.
- [ ] Storm timers and hints correctly describe current and next circles; matches finish without soft-locks.

## Automated regression tests

- [ ] Fixed-seed simulations for POI/loot distribution, safe spawns, storm progression, and win-condition termination.
- [ ] Metric events emit exactly once per stage; no personal information is recorded.
- [ ] Compare median, p75 and outlier encounter times across at least 20 simulated seeds and clearly distinguish simulated from human play data.

## Human QA / devices

- [ ] Run at least 10 casual and 10 classic human matches where possible, logging boredom/frustration episodes as qualitative feedback.
- [ ] Validate guidance visibility on small Android/iPhone landscape viewports.
- [ ] Test alternate storm timings with camping and low-health cases before setting defaults.

## Engineering guardrails

- [ ] Telemetry is opt-in for export and never sends user identifiers to an external service.
- [ ] Do not claim improved engagement based exclusively on bot simulation; require human validation.
- [ ] Keep world generation seed consistency and backward-compatible network protocol when introducing presets.

## Definition of done

Code and tests are committed together; local build and all available automated checks pass; any changed shared simulation behavior is verified in both offline and online modes; a focused mobile/desktop playtest receipt identifies tested browser/device, build SHA, observed behavior, known limitations, and remaining risk. Open a review PR; do **not** merge, deploy, or declare physical-device acceptance on behalf of the owner.
