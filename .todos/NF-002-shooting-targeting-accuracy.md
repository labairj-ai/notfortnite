# NF-002 — Align crosshair, hit geometry and combat feedback

Status: **IMPLEMENTED — REVIEW / ACCEPTANCE PENDING**<br>
Priority: **P0 / fairness**  
Release: **1 — core playability**  
Dependencies: **NF-010, NF-001**  
Primary code: `src/main.js`, `src/world.js`, `src/ui.js`, `src/fx.js`, `src/sfx.js`, `server/server.js`

## Problem / current evidence

`fireActiveItem()` calculates shot direction from the camera while `updateCamera()` occurs later in the frame; world blockers are approximated by spheres and the server currently accepts a client-reported hit and damage amount. These can produce perceived crosshair mismatch, implausible occlusion and unfair online hits.

## Implementation steps

- [ ] Move camera pose calculation ahead of firing/hit acquisition or calculate the aiming ray from current yaw/pitch each frame; add debug visualization for sightline and resolved impact.
- [ ] Use camera crosshair ray to select aim point, then reconcile the weapon muzzle ray to avoid shooting through near cover; correct origin/impact separation in third-person view.
- [ ] Replace spherical build-piece occlusion with geometry-appropriate wall/floor/ramp intersections and consistent hitboxes for player bodies; preserve performant broad-phase checks.
- [ ] Add optional visual feedback for shield vs health damage, directional incoming-fire indicators and weapon-specific impact sounds; never imply a hit before authoritative confirmation.
- [ ] Create a server-side validation plan and implementation for online hit cadence, target/range/occlusion and plausible position/weapon state; reject malformed/non-finite requests.

## Acceptance criteria

- [ ] At 5m, 20m and 70m, unobstructed centered shots consistently hit corresponding test targets within each weapon's supported range and spread model.
- [ ] Visible walls/floors/ramps occlude gunfire appropriately; nearby cover cannot be bypassed by a displaced third-person camera.
- [ ] On-screen hitmarkers and floating damage numbers reflect accepted damage, not merely local ray intersection.
- [ ] Two network clients cannot submit arbitrary 200-damage hits with no plausible shot; legitimate hits remain playable under representative latency.

## Automated regression tests

- [ ] Fixed-angle and rapidly rotated camera scenarios, point-blank and long-range shots, target partially behind cover, upper/lower ramp collisions and shot-through-wall regression.
- [ ] Negative, NaN, Infinity, duplicate, excess-fire-rate and impossible-distance network attack inputs are safely rejected.
- [ ] Simulated 50ms/100ms/200ms latency runs distinguish responsiveness from false hit confirmations.

## Human QA / devices

- [ ] Desktop mouse and mobile touch test at short, medium and long range; record reticle, tracer and impact in one video.
- [ ] Verify shield and health feedback are readable on small screens without covering the crosshair.
- [ ] Check performance of the new raycast logic on low-tier phone presets.

## Engineering guardrails

- [ ] Do not change damage, rarity or spread balancing without separate measurement and signoff.
- [ ] Maintain parity across offline and online outcomes; put deterministic math in a shared module where practical.
- [ ] Treat server hit authority as a prerequisite before labeling online competitive play fair or cheat-resistant.

## Definition of done

Code and tests are committed together; local build and all available automated checks pass; any changed shared simulation behavior is verified in both offline and online modes; a focused mobile/desktop playtest receipt identifies tested browser/device, build SHA, observed behavior, known limitations, and remaining risk. Open a review PR; do **not** merge, deploy, or declare physical-device acceptance on behalf of the owner.

## Implementation review receipt

Source implementation is prepared in the reviewed PR stack; see [the implementation matrix](../docs/BACKLOG-IMPLEMENTATION.md) and [machine-readable evidence](../docs/release-evidence.json). Automated results are recorded separately from human and physical-device acceptance. Original acceptance checkboxes remain open wherever the complete original criterion has not been independently certified. This task is not closed, merged, deployed, or physically certified.
