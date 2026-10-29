import { test, expect } from "@playwright/test";
async function boot(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await page.waitForFunction(() => window.__gameTest);
  return errors;
}
test("offline landing, authoritative loot/build, storm elimination and replay", async ({
  page,
}) => {
  const errors = await boot(page);
  await page.locator("#play-solo-btn").click();
  await expect(page.locator("#hud")).toBeVisible();
  await page.waitForFunction(() => window.__gameTest.getSession()?.me);
  await page.evaluate(async () => {
    const s = window.__gameTest.getSession(),
      { spawnGroundLoot } = await import("/notfortnite/shared/match.js");
    s.me.y = s.world.heightAt(s.me.x, s.me.z);
    s.phys.gliding = false;
    s.phys.grounded = true;
    spawnGroundLoot(
      s.match,
      { kind: "weapon", w: "ar", rarity: 0 },
      s.me.x,
      s.me.y,
      s.me.z,
      { onEvent: () => {} },
    );
  });
  await page.waitForFunction(() =>
    window.__gameTest.getSession().slots.some((i) => i?.w === "ar"),
  );
  await page.evaluate(() => {
    const s = window.__gameTest.getSession();
    s.me.mats.wood = 100;
    window.__gameTest.tryPlace();
  });
  expect(
    await page.evaluate(() => window.__gameTest.getSession().me.mats.wood),
  ).toBe(90);
  await page.evaluate(() => {
    const s = window.__gameTest.getSession();
    s.match.storm.r = 0;
    s.match.storm.cx = s.me.x + 100;
    s.match.storm.dps = 100000;
  });
  await expect(page.locator("#end-screen")).toBeVisible({ timeout: 10000 });
  await page.locator("#end-again-btn").click();
  await expect(page.locator("#hud")).toBeVisible();
  expect(errors).toEqual([]);
});
test("Practice target, heal, reset, exit and next battle use clean state", async ({
  page,
}) => {
  const errors = await boot(page);
  await page.locator("#practice-btn").click();
  await expect(page.locator("#practice-bar")).toBeVisible();
  const result = await page.evaluate(() => {
    const t = window.__gameTest,
      s = t.getSession(),
      p = s.match.players.get("target0");
    s.me.yaw = 0;
    s.me.pitch = 0;
    const r = t.dispatchAction({
      t: "attack",
      slot: 1,
      aim: { x: p.x, y: p.y + 1.2, z: p.z },
    });
    return { ok: r.ok, noStorm: s.match.storm.dps };
  });
  expect(result).toEqual({ ok: true, noStorm: 0 });
  await page.locator("#practice-reset").click();
  await expect(page.locator("#practice-status")).toContainText("0/8");
  await page.locator("#practice-exit").click();
  await expect(page.locator("#menu-screen")).toBeVisible();
  expect(await page.evaluate(() => window.__gameTest.getSession())).toBeNull();
  await page.locator("#play-solo-btn").click();
  expect(
    await page.evaluate(() => !!window.__gameTest.getSession().practice),
  ).toBe(false);
  expect(errors).toEqual([]);
});
test("two clients share authoritative online lobby and seed", async ({
  browser,
}) => {
  const a = await browser.newPage(),
    b = await browser.newPage();
  const errors = [];
  for (const p of [a, b]) {
    errors.push(...(await boot(p)));
    await p.locator("#play-online-btn").click();
    await p.locator("#server-url").fill("ws://127.0.0.1:8081");
    await p.locator("#server-connect-btn").click();
    await p.waitForFunction(
      () => window.__gameTest.getSession()?.mode === "online",
    );
  }
  expect(await a.evaluate(() => window.__gameTest.getSession().seed)).toBe(
    await b.evaluate(() => window.__gameTest.getSession().seed),
  );
  await a.close();
  await b.close();
  expect(errors).toEqual([]);
});
test("touch pointer ownership, cancellation, blur and disable reset held inputs", async ({
  page,
}) => {
  const errors = await boot(page);
  await page.locator("#practice-btn").click();
  const result = await page.evaluate(() => {
    const t = window.__gameTest,
      c = t.controls,
      fire = document.getElementById("btn-fire");
    fire.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 1,
        pointerType: "touch",
        bubbles: true,
        cancelable: true,
      }),
    );
    const held = c.fire;
    window.dispatchEvent(
      new PointerEvent("pointercancel", { pointerId: 1, pointerType: "touch" }),
    );
    const canceled = !c.fire && !c.firePressed;
    c.fire = true;
    c.jump = true;
    window.dispatchEvent(new Event("blur"));
    return { held, canceled, blur: !c.fire && !c.jump };
  });
  expect(result).toEqual({ held: true, canceled: true, blur: true });
  expect(errors).toEqual([]);
});
for (const size of [
  [568, 320],
  [667, 375],
  [844, 390],
  [932, 430],
  [1024, 768],
])
  test("controls fit " + size.join("x"), async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: size[0], height: size[1] },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await boot(page);
    await page.locator("#practice-btn").click();
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll("#touch-buttons button")]
        .filter((e) => getComputedStyle(e).display !== "none")
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { id: e.id, x: r.x, y: r.y, w: r.width, h: r.height };
        }),
    );
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(size[0]);
      expect(b.y + b.h).toBeLessThanOrEqual(size[1]);
      expect(b.w).toBeGreaterThanOrEqual(44);
      expect(b.h).toBeGreaterThanOrEqual(44);
    }
    await context.close();
  });

test("simultaneous move/look/fire/jump keep independent pointer ownership", async ({
  page,
}) => {
  await boot(page);
  await page.locator("#practice-btn").click();
  const r = await page.evaluate(() => {
    const c = window.__gameTest.controls,
      canvas = document.getElementById("game-canvas");
    const send = (el, type, id, x, y) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: id,
          pointerType: "touch",
          clientX: x,
          clientY: y,
        }),
      );
    send(canvas, "pointerdown", 10, 40, innerHeight - 80);
    send(canvas, "pointermove", 10, 80, innerHeight - 80);
    send(canvas, "pointerdown", 20, innerWidth / 2, 100);
    send(canvas, "pointermove", 20, innerWidth / 2 + 20, 100);
    send(document.getElementById("btn-fire"), "pointerdown", 30, 0, 0);
    send(document.getElementById("btn-jump"), "pointerdown", 40, 0, 0);
    const held = c.moveX > 0 && c.lookDX > 0 && c.fire && c.jump;
    send(window, "pointerup", 30, 0, 0);
    const fireReleased = !c.fire && c.jump && c.moveX > 0;
    send(window, "pointercancel", 40, 0, 0);
    const jumpReleased = !c.jump && c.moveX > 0;
    send(window, "pointerup", 10, 0, 0);
    send(window, "pointercancel", 20, 0, 0);
    return {
      held,
      fireReleased,
      jumpReleased,
      clean: c.moveX === 0 && c.lookDX === 0 && !c.fire && !c.jump,
    };
  });
  expect(r).toEqual({
    held: true,
    fireReleased: true,
    jumpReleased: true,
    clean: true,
  });
});
test("settings persist/reset and optional model failure keeps a playable character", async ({
  page,
}) => {
  const errors = await boot(page);
  await page.locator("#settings-btn").click();
  await page.locator("[name=sensitivity]").evaluate((el) => {
    el.value = "2";
  });
  await page.locator("[name=sensitivity]").dispatchEvent("change");
  await page.locator("#settings-close").click();
  await page.reload();
  await page.waitForFunction(() => window.__gameTest);
  expect(
    await page.evaluate(() => window.__gameTest.controls.settings.sensitivity),
  ).toBe(2);
  await page.locator("#settings-btn").click();
  await page.locator("#settings-reset").click();
  await page.locator("#settings-close").click();
  expect(
    await page.evaluate(() => window.__gameTest.controls.settings.sensitivity),
  ).toBe(1);
  await page.route("**/*.glb", (r) => r.abort());
  await page.evaluate(() => {
    localStorage.setItem(
      "nf_custom",
      JSON.stringify({
        name: "Player",
        body: 6,
        skin: 0,
        outfit: 0,
        hat: 0,
        hair: 0,
        hairColor: 0,
      }),
    );
  });
  await page.reload();
  await page.waitForFunction(() => window.__gameTest);
  await page.locator("#practice-btn").click();
  await expect(page.locator("#practice-bar")).toBeVisible();
  await page.waitForFunction(() => window.__myChar);
  expect(
    await page.evaluate(() => !!window.__myChar.userData.pendingModel),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("full inventory swap cancel preserves incoming item and confirmed swap drops one item", async ({
  page,
}) => {
  const errors = await boot(page);
  await page.locator("#practice-btn").click();
  const incoming = await page.evaluate(async () => {
    const t = window.__gameTest,
      s = t.getSession(),
      { spawnGroundLoot } = await import("/notfortnite/shared/match.js");
    for (let i = 1; i < 6; i++)
      s.me.slots[i] = { kind: "weapon", w: "pistol", rarity: 0 };
    const d = spawnGroundLoot(
      s.match,
      { kind: "weapon", w: "sniper", rarity: 4 },
      s.me.x,
      s.me.y,
      s.me.z,
      { onEvent: () => {} },
    );
    t.tryInteract();
    return d.id;
  });
  await expect(page.locator("#swap-dialog")).toBeVisible();
  await page.locator("#swap-cancel").click();
  expect(
    await page.evaluate(
      (id) => window.__gameTest.getSession().match.groundLoot.has(id),
      incoming,
    ),
  ).toBe(true);
  await page.evaluate(() => window.__gameTest.tryInteract());
  await page.locator("#swap-slots button").first().click();
  expect(
    await page.evaluate(() => window.__gameTest.getSession().me.slots[1].w),
  ).toBe("sniper");
  expect(
    await page.evaluate(
      (id) => window.__gameTest.getSession().match.groundLoot.has(id),
      incoming,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});

test("repeated Practice sessions release scene resources after cache warmup", async ({
  page,
}) => {
  const errors = await boot(page),
    samples = [];
  for (let i = 0; i < 4; i++) {
    await page.locator("#practice-btn").click();
    await page.waitForFunction(() => window.__myChar);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    samples.push(
      await page.evaluate(() => ({ ...window.__performanceReport().renderer })),
    );
    await page.locator("#practice-exit").click();
    await expect(page.locator("#menu-screen")).toBeVisible();
  }
  expect(samples[3].geometries).toBeLessThanOrEqual(samples[1].geometries + 3);
  expect(samples[3].textures).toBeLessThanOrEqual(samples[1].textures + 3);
  expect(errors).toEqual([]);
});

test("leaving an online lobby cannot later replace a new Practice session", async ({
  page,
}) => {
  const errors = await boot(page);
  await page.locator("#play-online-btn").click();
  await page.locator("#server-url").fill("ws://127.0.0.1:8081");
  await page.locator("#server-connect-btn").click();
  await page.waitForFunction(
    () => window.__gameTest.getSession()?.mode === "online",
  );
  await page.locator("#lobby-cancel-btn").click();
  await page.locator("#practice-btn").click();
  // Allow the old disconnect UI timer to expire; it must not overwrite the new session.
  await page.waitForTimeout(1800);
  await expect(page.locator("#practice-bar")).toBeVisible();
  await expect(page.locator("#hud")).toBeVisible();
  expect(errors).toEqual([]);
});
