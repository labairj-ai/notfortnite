// Tiny synthesized sound effects via Web Audio. No assets needed.
let ctx = null;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function unlockAudio() { ac(); }

function blip(freq, dur, type = 'square', vol = 0.12, slide = 0) {
  try {
    const a = ac();
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
    gain.gain.setValueAtTime(vol, a.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    osc.connect(gain).connect(a.destination);
    osc.start();
    osc.stop(a.currentTime + dur);
  } catch { /* audio unavailable */ }
}

function noise(dur, vol = 0.1) {
  try {
    const a = ac();
    const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = a.createBufferSource();
    src.buffer = buf;
    const gain = a.createGain();
    gain.gain.value = vol;
    src.connect(gain).connect(a.destination);
    src.start();
  } catch { /* audio unavailable */ }
}

export const sfx = {
  shoot(weapon) {
    if (weapon === 'shotgun') { noise(0.22, 0.18); blip(90, 0.18, 'sawtooth', 0.1, -40); }
    else if (weapon === 'sniper') { noise(0.3, 0.2); blip(60, 0.3, 'sawtooth', 0.12, -30); }
    else if (weapon === 'pickaxe') { blip(180, 0.08, 'square', 0.08, -60); }
    else { noise(0.09, 0.1); blip(160, 0.07, 'square', 0.07, -80); }
  },
  hit() { blip(700, 0.06, 'square', 0.1, 200); },
  hurt() { blip(140, 0.2, 'sawtooth', 0.14, -60); },
  pickup() { blip(520, 0.07, 'sine', 0.12, 300); blip(780, 0.1, 'sine', 0.08, 200); },
  build() { blip(240, 0.08, 'square', 0.1, 60); },
  chest() { blip(392, 0.12, 'sine', 0.12); blip(523, 0.14, 'sine', 0.12); blip(659, 0.2, 'sine', 0.12); },
  heal() { blip(440, 0.25, 'sine', 0.1, 220); },
  storm() { blip(110, 0.6, 'sawtooth', 0.08, -30); },
  win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sine', 0.14), i * 140)); },
  lose() { [330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.35, 'sawtooth', 0.1), i * 180)); },
};
