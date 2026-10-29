# NF-009 — Reduce mobile load time and frame-time variability

Status: **IMPLEMENTED — PLAYTEST ACCEPTANCE PENDING**<br>
Priority: **P2 / mobile performance**  
Release: **3 — polish and readiness**  
Dependencies: **NF-004, NF-010**  
Primary code: `src/models.js`, `src/main.js`, `src/world.js`, `src/style.css`, `vite.config.js`

## Problem / current evidence

`preloadModels()` requests all 13 GLB character variants as a batch, even when most are unused. Touch devices use fixed low-quality rendering, but there are no measured adaptive quality, model memory, or frame-time regression gates.

## Implementation steps

- [ ] Record baseline first-interactive, transfer bytes, decoded asset memory, frame-time percentiles, GPU stalls and loading errors on representative devices.
- [ ] Load only the local character and currently visible opponents first; lazily load additional skins/models by visibility, with cancel/abort behavior on screen change.
- [ ] Evaluate mesh/texture compression and smaller mobile LOD variants; cache loaded rigs safely and dispose unused scene resources when sessions end.
- [ ] Provide Auto/Low/Medium/High quality presets and adjust DPR/effect toggles based on sustained frame-time rather than device touch detection alone.
- [ ] Throttle expensive HUD/minimap updates independently of frame rendering where appropriate and preserve responsive input.

## Acceptance criteria

- [ ] Proposed performance goals are evaluated against baseline: ≥30 FPS sustained on tested supported low-end hardware and 60 FPS target on capable hardware; report p50/p95 frame times and observed devices.
- [ ] Load-to-interactive and transferred/model-decoded bytes improve over current baseline in a repeatable measured test.
- [ ] Switching characters or sessions does not leak WebGL resources or lose animation/appearance fidelity.
- [ ] Fallback procedural characters render correctly if an optional model fails to load.

## Automated regression tests

- [ ] Asset loading unit tests: required-model-first, on-demand fallback, failed fetch, reused cache and session cancellation.
- [ ] Browser performance test records p50/p95 frame time during a scripted camera pan + bot battle; avoid declaring device acceptance based on CI emulator.
- [ ] Verify build output, GitHub Pages asset paths and app service-worker caching behavior after model changes.

## Human QA / devices

- [ ] Physical Android and iPhone: time to first usable control, 5-minute FPS trace, warm/cold loads, heat/throttling and memory after three matches.
- [ ] Check character models, shadows and cosmetics visually on low and high settings.
- [ ] Test weak network and offline repeat start with cached assets.

## Engineering guardrails

- [ ] No default network telemetry or mandatory third-party CDN.
- [ ] Quality tuning must not change hit detection, physics or fairness.
- [ ] Do not remove existing licensed asset credits or silently substitute artwork.

## Definition of done

Code and tests are committed together; local build and all available automated checks pass; any changed shared simulation behavior is verified in both offline and online modes; a focused mobile/desktop playtest receipt identifies tested browser/device, build SHA, observed behavior, known limitations, and remaining risk. Open a review PR; do **not** merge, deploy, or declare physical-device acceptance on behalf of the owner.

## Implementation review receipt

Source implementation is prepared in the reviewed PR stack; see [the implementation matrix](../docs/BACKLOG-IMPLEMENTATION.md) and [machine-readable evidence](../docs/release-evidence.json). Automated results are recorded separately from human and physical-device acceptance. Original acceptance checkboxes remain open wherever the complete original criterion has not been independently certified. The owner subsequently requested a direct source push. This task remains open for human/device acceptance; publishing does not grant physical certification.
