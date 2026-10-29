# NF-003 — Prevent stuck controls and stabilize multi-touch

Status: **IMPLEMENTED — REVIEW / ACCEPTANCE PENDING**<br>
Priority: **P0 / input correctness**  
Release: **1 — core playability**  
Dependencies: **NF-010**  
Primary code: `src/controls.js`, `src/main.js`, `src/style.css`

## Problem / current evidence

Touch buttons bind `touchstart` and `touchend` but lack an explicit `touchcancel` path for held fire/jump. Movement/look are globally bound to touch identifiers, while focus/visibility loss and orientation transitions may interrupt gesture completion.

## Implementation steps

- [ ] Unify control-button lifecycle with Pointer Events/pointer capture where supported, or add equivalent touchcancel cleanup for every held action.
- [ ] Implement a single `resetInputs(reason)` method invoked on blur, visibility hidden, pointer cancellation, orientation transitions, death, menu entry and session teardown.
- [ ] Track movement/aim/fire contacts independently by stable pointer IDs; exclude button touches from the look area; handle arbitrary touch ordering.
- [ ] Make the control state reusable when entering a second match without requiring page reload; confirm desktop mouse/keyboard remains unaffected.
- [ ] Remove accidental browser navigation/text-selection/zoom only from the gameplay surface; retain accessible interaction on menus and form fields.

## Acceptance criteria

- [ ] No fire, jump, or movement is left active after touchcancel, blur, session exit or screen rotation.
- [ ] Simultaneous move + aim + fire + jump produces stable independent actions, and release of one finger does not stop another.
- [ ] Leaving and reentering play does not carry stale `fire`, `jump`, or look deltas.
- [ ] Keyboard/mouse controls and pointer lock still operate on desktop without a touch-capability false positive.

## Automated regression tests

- [ ] Synthetic pointer/touch lifecycle: down/move/up, down/cancel, multi-ID swap, lost focus, hidden tab and exit-to-menu.
- [ ] Repeated fast taps vs held fire; jump edge detection; UI-button touch should never initiate look.
- [ ] Desktop pointer lock lost and restored; hybrid touchscreen laptop input.

## Human QA / devices

- [ ] Android Chrome and iPhone Safari: 5-minute uninterrupted movement/combat test with at least 20 simultaneous gestures.
- [ ] Rotate or background the app while holding fire and verify inputs reset after resume.
- [ ] Try small and large phones, landscape cutouts/safe areas, and tablet split-screen where supported.

## Engineering guardrails

- [ ] Do not change the current movement speed or weapon firing rate in an input-fix PR.
- [ ] Keep the control contract (`moveX`, `moveZ`, `fire`, `jumpPressed`, etc.) stable or migrate consumers atomically.
- [ ] No hidden input automation, permanent auto-fire, or interaction while menus are open.

## Definition of done

Code and tests are committed together; local build and all available automated checks pass; any changed shared simulation behavior is verified in both offline and online modes; a focused mobile/desktop playtest receipt identifies tested browser/device, build SHA, observed behavior, known limitations, and remaining risk. Open a review PR; do **not** merge, deploy, or declare physical-device acceptance on behalf of the owner.

## Implementation review receipt

Source implementation is prepared in the reviewed PR stack; see [the implementation matrix](../docs/BACKLOG-IMPLEMENTATION.md) and [machine-readable evidence](../docs/release-evidence.json). Automated results are recorded separately from human and physical-device acceptance. Original acceptance checkboxes remain open wherever the complete original criterion has not been independently certified. This task is not closed, merged, deployed, or physically certified.
