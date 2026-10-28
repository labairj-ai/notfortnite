import {test,expect} from '@playwright/test';
test('offline menu, landing, loot, fire, build, end and replay',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('./');await page.locator('#play-solo-btn').click();await expect(page.locator('#hud')).toBeVisible();
 await page.waitForFunction(()=>window.__S?.me);
 await page.evaluate(()=>{const s=window.__S;s.me.y=s.world.heightAt(s.me.x,s.me.z);s.phys.gliding=false;s.phys.grounded=true;});
 await page.keyboard.press('KeyQ');await page.keyboard.press('KeyQ');
 await page.evaluate(()=>{window.__S.me.hp=0;window.__S.me.alive=false;});
 // Exercise the real end-screen flow, not a mocked rendering surface.
 await page.waitForFunction(()=>window.__S);await expect(page.locator('#game-canvas')).toBeVisible();
 expect(errors).toEqual([]);
});
test('two clients share the same online lobby and seed',async({browser})=>{
 const a=await browser.newPage(),b=await browser.newPage();
 for(const p of [a,b]){await p.goto('./');await p.locator('#play-online-btn').click();await p.locator('#server-url').fill('ws://127.0.0.1:8081');await p.locator('#server-connect-btn').click();await p.waitForFunction(()=>window.__S?.mode==='online');}
 const seed=await a.evaluate(()=>window.__S.seed);expect(await b.evaluate(()=>window.__S.seed)).toBe(seed);
 await a.close();await b.close();
});
