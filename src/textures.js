// Procedural canvas textures — stylized hand-painted look, zero asset files.
import * as THREE from 'three';

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function jitter(ctx, base, amt) {
  const v = (Math.random() - 0.5) * amt;
  return `hsl(${base.h + v * 8}, ${base.s}%, ${Math.max(5, Math.min(95, base.l + v))}%)`;
}

export function woodTexture() {
  return canvasTex(128, (ctx, S) => {
    const base = { h: 32, s: 42, l: 42 };
    ctx.fillStyle = `hsl(32, 42%, 42%)`;
    ctx.fillRect(0, 0, S, S);
    // planks
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const y = (r / rows) * S;
      ctx.fillStyle = jitter(ctx, base, 14);
      ctx.fillRect(0, y, S, S / rows - 2);
      // grain streaks
      ctx.strokeStyle = 'rgba(60,35,10,0.25)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        const gy = y + Math.random() * (S / rows - 4) + 2;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(S * 0.3, gy + 3, S * 0.6, gy - 3, S, gy);
        ctx.stroke();
      }
      // plank gap shadow
      ctx.fillStyle = 'rgba(30,15,5,0.55)';
      ctx.fillRect(0, y + S / rows - 2, S, 2);
      // nails
      ctx.fillStyle = 'rgba(40,30,20,0.8)';
      ctx.beginPath(); ctx.arc(8, y + S / rows / 2, 2, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(S - 8, y + S / rows / 2, 2, 0, 7); ctx.fill();
    }
  }, 1);
}

export function brickTexture() {
  return canvasTex(128, (ctx, S) => {
    ctx.fillStyle = '#8f8578';   // mortar
    ctx.fillRect(0, 0, S, S);
    const bh = S / 5, bw = S / 2.5;
    const base = { h: 8, s: 45, l: 46 };
    for (let r = 0; r < 5; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let cIdx = -1; cIdx < 4; cIdx++) {
        const x = cIdx * bw + off;
        ctx.fillStyle = jitter(ctx, base, 16);
        ctx.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
        // highlight edge
        ctx.fillStyle = 'rgba(255,235,220,0.14)';
        ctx.fillRect(x + 2, r * bh + 2, bw - 4, 2);
      }
    }
  }, 1);
}

export function metalTexture() {
  return canvasTex(128, (ctx, S) => {
    ctx.fillStyle = '#7f8a96';
    ctx.fillRect(0, 0, S, S);
    // brushed noise
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(${200 + Math.random() * 40}, ${210 + Math.random() * 40}, 230, ${Math.random() * 0.06})`;
      ctx.fillRect(Math.random() * S, Math.random() * S, Math.random() * 30 + 6, 1);
    }
    // plate seams + rivets
    ctx.strokeStyle = 'rgba(30,38,48,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, S - 2, S - 2);
    ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.stroke();
    ctx.fillStyle = 'rgba(35,42,52,0.9)';
    for (const [x, y] of [[10, 10], [S - 10, 10], [10, S - 10], [S - 10, S - 10], [S / 2 + 8, S / 2], [S / 2 - 8, S / 2]]) {
      ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(220,230,240,0.5)';
      ctx.beginPath(); ctx.arc(x - 1, y - 1, 1.2, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(35,42,52,0.9)';
    }
  }, 1);
}

// Cartoon face for characters — big expressive eyes, cached per skin color.
const faceCache = new Map();
export function faceTexture(skinColor) {
  if (faceCache.has(skinColor)) return faceCache.get(skinColor);
  const tex = canvasTex(128, (ctx, S) => {
    ctx.fillStyle = skinColor;
    ctx.fillRect(0, 0, S, S);
    for (const [ex, tilt] of [[S * 0.34, -1], [S * 0.66, 1]]) {
      // white
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(ex, S * 0.45, 12, 15.5, tilt * 0.06, 0, 7); ctx.fill();
      // iris + pupil
      ctx.fillStyle = '#3d7bd6';
      ctx.beginPath(); ctx.arc(ex + tilt, S * 0.47, 7.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#101418';
      ctx.beginPath(); ctx.arc(ex + tilt, S * 0.47, 4, 0, 7); ctx.fill();
      // sparkle highlights
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex + tilt + 2.6, S * 0.43, 2.4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(ex + tilt - 2.4, S * 0.5, 1.1, 0, 7); ctx.fill();
      // upper lid line
      ctx.strokeStyle = 'rgba(70,45,30,0.75)';
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.ellipse(ex, S * 0.45, 12, 15.5, tilt * 0.06, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      // brow with a bit of attitude
      ctx.strokeStyle = 'rgba(60,40,25,0.9)';
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - 12 * tilt, S * 0.26);
      ctx.quadraticCurveTo(ex, S * 0.215, ex + 12 * tilt, S * 0.245);
      ctx.stroke();
    }
    // nose hint
    ctx.strokeStyle = 'rgba(120,80,60,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(S * 0.5, S * 0.56); ctx.lineTo(S * 0.485, S * 0.63); ctx.stroke();
    // confident smirk
    ctx.strokeStyle = 'rgba(110,55,45,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(S * 0.4, S * 0.75);
    ctx.quadraticCurveTo(S * 0.52, S * 0.815, S * 0.63, S * 0.74);
    ctx.stroke();
  });
  tex.repeat.set(1, 1);
  faceCache.set(skinColor, tex);
  return tex;
}

export function cloudTexture() {
  return canvasTex(128, (ctx, S) => {
    ctx.clearRect(0, 0, S, S);
    const blob = (x, y, r) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    };
    blob(S * 0.5, S * 0.6, S * 0.32);
    blob(S * 0.3, S * 0.65, S * 0.22);
    blob(S * 0.7, S * 0.63, S * 0.24);
    blob(S * 0.45, S * 0.45, S * 0.2);
    blob(S * 0.6, S * 0.48, S * 0.18);
  });
}

// vertical gradient used for loot/chest light beams (tinted via material color)
export function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 64, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function sunTexture() {
  return canvasTex(128, (ctx, S) => {
    ctx.clearRect(0, 0, S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,252,230,1)');
    g.addColorStop(0.18, 'rgba(255,240,180,0.95)');
    g.addColorStop(0.45, 'rgba(255,210,120,0.35)');
    g.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  });
}
