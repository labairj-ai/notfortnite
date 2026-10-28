# NF-006 — Introduce cover-aware bots with measurable difficulty tiers

Status: **TODO**  
Priority: **P1 / opponent quality**  
Release: **2 — engagement**  
Dependencies: **NF-001, NF-002, NF-010**  
Primary code: `shared/match.js`, `shared/worldgen.js`, `src/world.js`, `shared/constants.js`, `server/server.js`

## Problem / current evidence

Bots currently move toward/away from nearby targets using simple distance rules; they do not path around buildings or player-built walls, and a scalar probability determines hits without geometry-based cover. This can make combat predictable or unfair.

## Implementation steps

- [ ] Extract bot decision model and shared 2D/world collision queries that are deterministic, headless, and usable in browser and server.
- [ ] Add obstacle avoidance or lightweight waypoints for buildings, props and temporary player builds; cap pathfinding CPU per tick.
- [ ] Create bot states: land/loot, search, investigate sound, reposition, attack, seek cover/heal, rotate toward storm and retreat.
- [ ] Add tactical variety (cautious, aggressive, ranged, scavenger) and three configurable difficulty tiers changing reaction/accuracy/decision quality, not merely health/damage.
- [ ] Use obstruction checks for bot shot outcomes; block damage through valid cover and prevent multiple bots permanently targeting one player.
- [ ] Make stronger behavior observable through a local debugging overlay and deterministic decision traces.

## Acceptance criteria

- [ ] Bots route around a simple wall maze and user-built barrier without repeatedly walking into them.
- [ ] Bots cannot hit a player hidden behind intact opaque cover.
- [ ] Each difficulty has a measured distinct engagement profile (reaction, aim, cover use) while sharing normal player weapon damage.
- [ ] At least two bot strategies are visible in repeatable encounters; bots still rotate before the storm closes.

## Automated regression tests

- [ ] Headless fixed-seed duel, maze, cover shot, added/removed build, storm movement and outnumbered-player scenarios.
- [ ] AI decision budget stays bounded for 9 bots at server tick rate; no infinite path loops.
- [ ] Offline and online simulations produce equivalent bot decision sequences for matching world/seed input.

## Human QA / devices

- [ ] Play 10 matches across difficulty modes; classify bot deaths, missed paths, cover violations and target focus.
- [ ] Confirm beginner bots remain approachable and competitive bots are challenging without superhuman reflexes.
- [ ] Evaluate on mobile low-quality preset for stutter from AI/pathfinding.

## Engineering guardrails

- [ ] Do not give bots special weapon damage, impossible vision, or direct access to hidden player state.
- [ ] Prefer shared pure simulation code; server must remain source of truth for online bot decisions.
- [ ] Avoid large AI/LLM runtime dependencies and network services in the per-frame bot loop.

## Definition of done

Code and tests are committed together; local build and all available automated checks pass; any changed shared simulation behavior is verified in both offline and online modes; a focused mobile/desktop playtest receipt identifies tested browser/device, build SHA, observed behavior, known limitations, and remaining risk. Open a review PR; do **not** merge, deploy, or declare physical-device acceptance on behalf of the owner.
