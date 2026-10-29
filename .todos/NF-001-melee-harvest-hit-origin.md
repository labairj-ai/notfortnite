# NF-001 — Repair close-range melee targeting and harvesting

Status: **IMPLEMENTED — REVIEW / ACCEPTANCE PENDING**<br>
Priority: **P0 / functional defect**  
Release: **1 — core playability**  
Dependencies: **NF-010 (baseline harness)**  
Primary code: `src/main.js`, `src/world.js`, `shared/constants.js`, `shared/match.js`

## Problem / current evidence

`fireActiveItem()` casts from the third-person camera while `pickaxe.range` is 3.4, but `updateCamera()` positions the camera about 4.4 units behind the avatar. An interactable directly in front of the character may be beyond pickaxe range measured from the camera even while visibly in reach.

## Implementation steps

- [ ] Separate melee/harvesting target acquisition from camera-origin hitscan; use player-relative reach (body/hand origin) with view-cone validation and a reliable closest valid target.
- [ ] Validate maximum distance to the actual target surface, hit direction, vertical separation and obstructing geometry; do not target through walls or terrain.
- [ ] Preserve ordinary gun camera aiming; fix pickaxe-only range logic, tracer endpoints and harvesting VFX to match contact.
- [ ] Ensure pickaxe damage on build pieces and props is processed exactly once per swing in offline and online mode; retain the intended materials-per-hit rule.
- [ ] Add short interaction feedback for in-range vs out-of-range harvest targets; tune selection tolerance separately for touch if evidence supports it.

## Acceptance criteria

- [ ] A tree, rock, metal crate and player-built wall directly within 3.4 units of player reach register a valid deliberate swing in controlled tests.
- [ ] A target beyond melee range or behind solid cover is never damaged or harvested.
- [ ] Harvest gains and prop HP changes occur once per accepted strike, with consistent visuals and authoritative online state.
- [ ] Pickaxe swings still respect the configured 0.5-second rate; firearms retain their previous effective ranges.

## Automated regression tests

- [ ] Near/far boundary cases, varying camera zoom/angle, steep terrain, overlapping props, wall-blocked props and direct character overlap.
- [ ] Compare offline and networked harvest/material accounting; verify no duplicated prop destruction on simultaneous clients.
- [ ] Test sword/pickaxe whiffs and dropped frames without frame-rate-dependent double hits.

## Human QA / devices

- [ ] On desktop and touch, walk to each harvestable asset and perform at least 20 strikes from front, side and elevated ground.
- [ ] Capture a brief reproducible hitbox-debug recording when a swing misses; record actual player-to-target distance.
- [ ] Confirm materials, VFX and hit reaction remain synchronized after several consecutive swings.

## Engineering guardrails

- [ ] No global weapon damage/range buff; melee uses its own validated target origin.
- [ ] Retain collision occlusion; do not turn melee into an unbounded nearest-object interaction.
- [ ] Network clients may propose swings but must not silently gain resources for unverified actions.

## Definition of done

Code and tests are committed together; local build and all available automated checks pass; any changed shared simulation behavior is verified in both offline and online modes; a focused mobile/desktop playtest receipt identifies tested browser/device, build SHA, observed behavior, known limitations, and remaining risk. Open a review PR; do **not** merge, deploy, or declare physical-device acceptance on behalf of the owner.

## Implementation review receipt

Source implementation is prepared in the reviewed PR stack; see [the implementation matrix](../docs/BACKLOG-IMPLEMENTATION.md) and [machine-readable evidence](../docs/release-evidence.json). Automated results are recorded separately from human and physical-device acceptance. Original acceptance checkboxes remain open wherever the complete original criterion has not been independently certified. This task is not closed, merged, deployed, or physically certified.
