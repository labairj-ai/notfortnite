// Local-only, allowlisted match timings. No names, IPs, positions or remote export.
const stages = new Set([
  "landing",
  "weapon",
  "opponent",
  "damage",
  "elimination",
  "stormDeath",
  "build",
  "end",
]);
export function createMetrics(seed, preset) {
  return {
    schema: 1,
    seed: seed >>> 0,
    preset: preset === "Casual" ? "Casual" : "Classic",
    events: {},
    buildAttempts: 0,
    stormDeaths: 0,
  };
}
export function recordMetric(metrics, stage, time) {
  if (!stages.has(stage) || !Number.isFinite(time) || time < 0) return;
  if (stage === "build") metrics.buildAttempts++;
  if (stage === "stormDeath") metrics.stormDeaths++;
  if (metrics.events[stage] === undefined)
    metrics.events[stage] = +time.toFixed(3);
}
export function summarizeMetrics(m) {
  const e = m.events;
  return {
    seed: m.seed,
    preset: m.preset,
    landing: e.landing ?? null,
    weaponAfterLanding:
      e.weapon === undefined || e.landing === undefined
        ? null
        : Math.max(0, e.weapon - e.landing),
    firstContact: e.opponent ?? null,
    firstDamage: e.damage ?? null,
    firstElimination: e.elimination ?? null,
    duration: e.end ?? null,
    buildAttempts: m.buildAttempts,
    stormDeaths: m.stormDeaths,
  };
}
export function persistMetrics(m, storage) {
  try {
    const prior = JSON.parse(storage.getItem("notfortnite-matches") || "[]");
    storage.setItem(
      "notfortnite-matches",
      JSON.stringify(
        [summarizeMetrics(m), ...(Array.isArray(prior) ? prior : [])].slice(
          0,
          10,
        ),
      ),
    );
  } catch {}
}
