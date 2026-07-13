// Game-feel effects: impact particles, floating damage numbers, muzzle
// flashes, elimination bursts. All pooled/lightweight.
import * as THREE from 'three';

const MAX_PARTICLES = 160;

export function createFX(scene) {
  // ---- particle pool (one instanced mesh) ----
  const geo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const inst = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  inst.frustumCulled = false;
  scene.add(inst);
  const parts = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    parts.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1 });
    inst.setColorAt(i, new THREE.Color('#fff'));
  }
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();
  let cursor = 0;

  function burst(x, y, z, color, count, speed, up = 2.5) {
    tmpColor.set(color);
    for (let i = 0; i < count; i++) {
      const p = parts[cursor];
      inst.setColorAt(cursor, tmpColor);
      cursor = (cursor + 1) % MAX_PARTICLES;
      p.alive = true;
      p.x = x; p.y = y; p.z = z;
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      p.vx = Math.cos(a) * v;
      p.vz = Math.sin(a) * v;
      p.vy = up * (0.5 + Math.random() * 0.9);
      p.max = p.life = 0.35 + Math.random() * 0.35;
      p.size = 0.7 + Math.random() * 0.8;
    }
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }

  // ---- floating damage numbers (sprites, short-lived) ----
  const numbers = [];
  function number(text, x, y, z, color = '#ffffff', scale = 1) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.font = '900 44px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(20,10,30,0.9)';
    ctx.strokeText(text, 64, 32);
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, toneMapped: false,
    }));
    spr.scale.set(1.7 * scale, 0.85 * scale, 1);
    spr.position.set(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5);
    spr.renderOrder = 20;
    scene.add(spr);
    numbers.push({ spr, life: 0.9, tex });
  }

  // ---- muzzle flash (a reused point light + sprite) ----
  const flashLight = new THREE.PointLight('#ffd27a', 0, 9, 2);
  scene.add(flashLight);
  let flashT = 0;
  function muzzleFlash(x, y, z) {
    flashLight.position.set(x, y, z);
    flashLight.intensity = 26;
    flashT = 0.05;
  }

  return {
    burst,
    number,
    muzzleFlash,
    hitSparks: (x, y, z) => burst(x, y, z, '#ffe9a0', 6, 2.6),
    harvestBurst: (x, y, z, color) => burst(x, y, z, color, 9, 3.2),
    killBurst: (x, y, z) => {
      burst(x, y + 1, z, '#ffd94d', 22, 4.5, 4);
      burst(x, y + 1, z, '#b04df0', 14, 3.5, 3);
    },
    update(dt) {
      // particles
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = parts[i];
        if (!p.alive) {
          dummy.position.set(0, -999, 0);
          dummy.scale.setScalar(0.0001);
        } else {
          p.life -= dt;
          if (p.life <= 0) { p.alive = false; continue; }
          p.vy -= 9.5 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          dummy.position.set(p.x, p.y, p.z);
          const s = p.size * (p.life / p.max);
          dummy.scale.setScalar(s);
          dummy.rotation.set(p.life * 7, p.life * 5, 0);
        }
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      // numbers
      for (let i = numbers.length - 1; i >= 0; i--) {
        const n = numbers[i];
        n.life -= dt;
        n.spr.position.y += dt * 1.5;
        n.spr.material.opacity = Math.min(1, n.life / 0.35);
        if (n.life <= 0) {
          scene.remove(n.spr);
          n.tex.dispose();
          n.spr.material.dispose();
          numbers.splice(i, 1);
        }
      }
      // flash
      if (flashT > 0) {
        flashT -= dt;
        if (flashT <= 0) flashLight.intensity = 0;
      }
    },
  };
}
