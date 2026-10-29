# NF-004 — Implement configurable mobile combat controls and HUD

Status: **IMPLEMENTED — REVIEW / ACCEPTANCE PENDING**<br>
Priority: **P1 / usability**  
Release: **1 — core playability**  
Dependencies: **NF-003**  
Primary code: `src/controls.js`, `src/style.css`, `src/ui.js`, `index.html`, `src/main.js`

## Problem / current evidence

Touch combat relies on a fixed left movement zone, right look-drag, dedicated fire/jump/build buttons and six inventory slots. Static sizes/locations may obstruct visibility on smaller phones and cannot currently be calibrated to the player's reach.

## Implementation steps

- [ ] Provide a settings screen for look sensitivity, invert-Y, handedness, joystick mode, fire/jump sizing and optional HUD opacity; persist locally with versioned defaults.
- [ ] Introduce mobile control presets (Simple, Standard, Advanced) and an edit-layout mode that drags/repositions controls within safe bounds.
- [ ] Add an optional low-strength aim assistance mode for solo/casual play with explicit range/FOV constraints and a clear off switch; do not silently enable for competitive multiplayer.
- [ ] Implement aim-and-fire gesture experiments behind a toggle; prevent button taps from also moving the camera.
- [ ] Keep building selector, loot interact prompt, minimap, health and slots readable under narrow landscape viewports and device cutouts.

## Acceptance criteria

- [ ] User settings survive a reload and can be reset to documented defaults.
- [ ] No overlapping or unreachable critical action buttons at tested phone/tablet viewport sizes; minimum practical touch targets are respected.
- [ ] Player can move, look, jump and fire without unintended gesture collisions.
- [ ] Aim assistance is disabled by default in competitive online matches until server policy and fairness are designed.

## Automated regression tests

- [ ] Layout snapshots at 568x320, 667x375, 844x390, 932x430, 1024x768 and common safe-area inset variants.
- [ ] Settings migration, reset, input clamping, mirrored handedness, and touch focus isolation.
- [ ] Automated UI accessibility smoke for tappable labels and state indications.

## Human QA / devices

- [ ] Physical Android and iPhone landscape play sessions with casual and experienced users; collect missed taps, thumb reach, accidental build opens, view obstruction.
- [ ] Verify touch UI in landscape, unusual aspect ratios and while browser bars appear/disappear.
- [ ] Compare simple and advanced presets with identical practice targets and note user preference.

## Engineering guardrails

- [ ] Control assistance must never grant extra game state, damage, or range.
- [ ] Retain classic controls as selectable default until controlled playtests support replacing them.
- [ ] Do not add asset-heavy HUD effects that undermine mobile frame rate.

## Definition of done

Code and tests are committed together; local build and all available automated checks pass; any changed shared simulation behavior is verified in both offline and online modes; a focused mobile/desktop playtest receipt identifies tested browser/device, build SHA, observed behavior, known limitations, and remaining risk. Open a review PR; do **not** merge, deploy, or declare physical-device acceptance on behalf of the owner.

## Implementation review receipt

Source implementation is prepared in the reviewed PR stack; see [the implementation matrix](../docs/BACKLOG-IMPLEMENTATION.md) and [machine-readable evidence](../docs/release-evidence.json). Automated results are recorded separately from human and physical-device acceptance. Original acceptance checkboxes remain open wherever the complete original criterion has not been independently certified. This task is not closed, merged, deployed, or physically certified.
