# NF-008 — Create lightweight combat, movement and building training arena

Status: **IMPLEMENTED — PLAYTEST ACCEPTANCE PENDING**<br>
Priority: **P1 / onboarding**  
Release: **2 — engagement**  
Dependencies: **NF-002, NF-004, NF-010**  
Primary code: `src/main.js`, `src/ui.js`, `index.html`, `shared/match.js`, `src/world.js`

## Problem / current evidence

The first-time player must learn movement, jumping, shooting, looting, harvesting and building during a live storm match. Death requires reentering a complete game, slowing skill acquisition and mobile layout tuning.

## Implementation steps

- [ ] Add a Practice option to the main menu running offline with a compact deterministic arena and no storm pressure.
- [ ] Create stationary and moving targets with visible damage/hit results, consistent target reset and selectable weapon loadouts.
- [ ] Add short guided steps for movement, firing, jumping, harvesting, wall/ramp placement and healing; permit skipping tutorials.
- [ ] Offer instant reposition/respawn plus a reset button and a clear exit that disposes the training scene/input state.
- [ ] Show personal accuracy/target-time metrics locally and optional overlay hints for touch controls.

## Acceptance criteria

- [ ] Practice launches offline without WebSocket, match lobby, or mandatory network access.
- [ ] Player can complete an end-to-end tutorial and restart each station immediately after failure.
- [ ] Exiting Practice restores the menu; next battle royale session has clean state, no leaked targets and no stuck input.
- [ ] Both keyboard/mouse and touch interfaces expose the same core training actions.

## Automated regression tests

- [ ] Menu → Practice → target hit → build → reset → exit → Battle Royale smoke path.
- [ ] Target hit detection and movement steps are deterministic under the same input replay.
- [ ] Repeated practice entry/exit does not accumulate event listeners, render objects or simulated players.

## Human QA / devices

- [ ] Have at least one first-time player complete training on mobile without verbal guidance; document unclear instructions.
- [ ] Measure target hit consistency and exercise time for both control presets.
- [ ] Confirm training remains smooth on devices meeting the low-quality target.

## Engineering guardrails

- [ ] No training rewards or state may modify competitive match results, inventory or matchmaking.
- [ ] Keep practice assets small and reused from existing art where possible.
- [ ] Do not force tutorial completion to unlock normal play.

## Definition of done

Code and tests are committed together; local build and all available automated checks pass; any changed shared simulation behavior is verified in both offline and online modes; a focused mobile/desktop playtest receipt identifies tested browser/device, build SHA, observed behavior, known limitations, and remaining risk. Open a review PR; do **not** merge, deploy, or declare physical-device acceptance on behalf of the owner.

## Implementation review receipt

Source implementation is prepared in the reviewed PR stack; see [the implementation matrix](../docs/BACKLOG-IMPLEMENTATION.md) and [machine-readable evidence](../docs/release-evidence.json). Automated results are recorded separately from human and physical-device acceptance. Original acceptance checkboxes remain open wherever the complete original criterion has not been independently certified. The owner subsequently requested a direct source push. This task remains open for human/device acceptance; publishing does not grant physical certification.
