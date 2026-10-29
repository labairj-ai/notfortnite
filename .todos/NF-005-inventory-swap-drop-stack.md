# NF-005 — Add intuitive inventory pickup, replacement and healing stacks

Status: **IMPLEMENTED — REVIEW / ACCEPTANCE PENDING**<br>
Priority: **P1 / looting**  
Release: **1 — core playability**  
Dependencies: **NF-003, NF-010**  
Primary code: `src/main.js`, `src/ui.js`, `src/controls.js`, `shared/match.js`, `server/server.js`

## Problem / current evidence

`tryTakeItem()` only fills empty slots 1–5. A full inventory rejects pickups, preventing upgrades and healing decisions. Online `pickup` currently removes world loot based on a client message without an authoritative inventory/reservation transaction.

## Implementation steps

- [ ] Create pure inventory functions for eligible stack merge, slot replacement, drop/swap, rarity/weapon comparison and inventory invariants; reserve slot 0 for pickaxe.
- [ ] On full inventory, show a compact contextual swap panel with equipped item stats, rarity and replace/cancel options; touch and desktop both usable.
- [ ] Implement stacking limits for compatible healing items and visible counts; preserve per-item use/HP/shield caps.
- [ ] In online mode, move pickup/swap acceptance to validated server transactions including proximity, item existence, single claimant, slot choice and authoritative acknowledgement.
- [ ] Ensure dropped items become world loot without duplication; handle simultaneous clients and disconnected players.

## Acceptance criteria

- [ ] A full inventory can swap in a better weapon or heal without losing the incoming pickup when the user cancels.
- [ ] Compatible heals stack to documented caps; incompatible stacks cannot merge; pickaxe cannot be discarded.
- [ ] A drop/swap never duplicates or deletes an item across network retries or simultaneous pickup attempts.
- [ ] HUD updates immediately after a confirmed accepted transaction and provides visible feedback when rejected.

## Automated regression tests

- [ ] Empty/full inventory, same-weapon rarity compare, heal stack boundary, discard/cancel, slot-0 protection and rapid slot switching.
- [ ] Two clients concurrently grab the same item: exactly one succeeds; retry/reconnect does not double award.
- [ ] Offline and online useHeal consume one valid use with correct HP/shield caps and no negative counts.

## Human QA / devices

- [ ] Perform 20 pickups with a full inventory on phone and desktop; confirm comparison text legibility.
- [ ] Verify gameplay movement remains responsive while swap dialog is open or intentionally paused.
- [ ] Test a loot swap while another client is approaching, with simulated latency and packet duplication.

## Engineering guardrails

- [ ] Do not auto-discard user-selected items without an explicit opt-in setting.
- [ ] All server-side inventory mutations must be authoritative, validated and replay-safe.
- [ ] Keep rarity weights, health caps and basic loot frequencies unchanged pending pacing analysis.

## Definition of done

Code and tests are committed together; local build and all available automated checks pass; any changed shared simulation behavior is verified in both offline and online modes; a focused mobile/desktop playtest receipt identifies tested browser/device, build SHA, observed behavior, known limitations, and remaining risk. Open a review PR; do **not** merge, deploy, or declare physical-device acceptance on behalf of the owner.

## Implementation review receipt

Source implementation is prepared in the reviewed PR stack; see [the implementation matrix](../docs/BACKLOG-IMPLEMENTATION.md) and [machine-readable evidence](../docs/release-evidence.json). Automated results are recorded separately from human and physical-device acceptance. Original acceptance checkboxes remain open wherever the complete original criterion has not been independently certified. This task is not closed, merged, deployed, or physically certified.
