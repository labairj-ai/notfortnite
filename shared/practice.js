import { WEAPONS } from "./constants.js";
export const PRACTICE_STEPS = [
  "Move three metres",
  "Jump and land",
  "Pick up a weapon",
  "Hit a target",
  "Harvest materials",
  "Place a wall",
  "Place a ramp",
  "Use a healing item",
];
export function createPractice() {
  return { completed: [], shots: 0, hits: 0, targetResets: 0, elapsed: 0 };
}
export function completePractice(p, step) {
  if (PRACTICE_STEPS.includes(step) && !p.completed.includes(step))
    p.completed.push(step);
}
export function practiceLoadout(weapon = "ar") {
  if (!WEAPONS[weapon] || weapon === "pickaxe") weapon = "ar";
  return [
    { kind: "weapon", w: "pickaxe", rarity: 0 },
    { kind: "weapon", w: weapon, rarity: 0 },
    { kind: "heal", h: "bandage", uses: 3 },
    null,
    null,
    null,
  ];
}
