// Input abstraction: touch (virtual joystick + buttons) and keyboard/mouse.
// Exposes a unified state the game loop reads each frame.

export const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

export function createControls(canvas) {
  const ctl = {
    moveX: 0, moveZ: 0,          // -1..1 movement input
    lookDX: 0, lookDY: 0,        // accumulated look delta this frame (consumed by caller)
    fire: false,                  // held
    firePressed: false,           // edge, consumed by caller
    jump: false,
    jumpPressed: false,
    interactPressed: false,
    buildTogglePressed: false,
    slotPressed: -1,              // 0-5, -1 none
    piecePressed: null,           // 'wall'|'floor'|'ramp'
    matCyclePressed: false,
    enabled: false,
  };

  // ---------------- Keyboard / mouse ----------------
  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (!ctl.enabled) return;
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'Space') { ctl.jumpPressed = true; }
    if (e.code === 'KeyF') ctl.interactPressed = true;
    if (e.code === 'KeyQ') ctl.buildTogglePressed = true;
    if (e.code === 'KeyR') ctl.matCyclePressed = true;
    if (e.code === 'KeyZ') ctl.piecePressed = 'wall';
    if (e.code === 'KeyX') ctl.piecePressed = 'floor';
    if (e.code === 'KeyC') ctl.piecePressed = 'ramp';
    const digit = e.code.match(/^Digit([1-6])$/);
    if (digit) ctl.slotPressed = parseInt(digit[1], 10) - 1;
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  window.addEventListener('mousedown', (e) => {
    if (!ctl.enabled || IS_TOUCH) return;
    if (document.pointerLockElement !== canvas) return;
    if (e.button === 0) { ctl.fire = true; ctl.firePressed = true; }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) ctl.fire = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (!ctl.enabled || document.pointerLockElement !== canvas) return;
    ctl.lookDX += e.movementX * 0.0022;
    ctl.lookDY += e.movementY * 0.0022;
  });

  function readKeyboard() {
    let x = 0, z = 0;
    if (keys.KeyW) z += 1;
    if (keys.KeyS) z -= 1;
    if (keys.KeyA) x -= 1;
    if (keys.KeyD) x += 1;
    const d = Math.hypot(x, z) || 1;
    ctl.moveX = x / d;
    ctl.moveZ = z / d;
    ctl.jump = !!keys.Space;
  }

  // ---------------- Touch ----------------
  const stick = document.getElementById('joystick');
  const knob = document.getElementById('joystick-knob');
  let stickTouch = null, lookTouch = null;
  let stickCx = 0, stickCy = 0;
  const STICK_R = 55;

  function bindButton(id, onDown, onUp) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); if (ctl.enabled) onDown(); }, { passive: false });
    if (onUp) el.addEventListener('touchend', (e) => { e.preventDefault(); onUp(); }, { passive: false });
  }

  if (IS_TOUCH) {
    bindButton('btn-fire', () => { ctl.fire = true; ctl.firePressed = true; }, () => { ctl.fire = false; });
    bindButton('btn-jump', () => { ctl.jump = true; ctl.jumpPressed = true; }, () => { ctl.jump = false; });
    bindButton('btn-build', () => { ctl.buildTogglePressed = true; });
    bindButton('btn-interact', () => { ctl.interactPressed = true; });
    bindButton('btn-piece-wall', () => { ctl.piecePressed = 'wall'; });
    bindButton('btn-piece-floor', () => { ctl.piecePressed = 'floor'; });
    bindButton('btn-piece-ramp', () => { ctl.piecePressed = 'ramp'; });
    bindButton('btn-mat', () => { ctl.matCyclePressed = true; });
    for (let i = 0; i < 6; i++) {
      bindButton('hud-slot-' + i, () => { ctl.slotPressed = i; });
    }

    window.addEventListener('touchstart', (e) => {
      if (!ctl.enabled) return;
      for (const t of e.changedTouches) {
        const onLeft = t.clientX < window.innerWidth * 0.4 && t.clientY > window.innerHeight * 0.35;
        const el = document.elementFromPoint(t.clientX, t.clientY);
        const onUI = el && el.closest && el.closest('.touch-btn, #hud-slots, #joystick');
        if (onLeft && stickTouch === null && (!onUI || (el && el.closest('#joystick')))) {
          stickTouch = t.identifier;
          stickCx = t.clientX; stickCy = t.clientY;
          stick.style.left = (t.clientX - STICK_R) + 'px';
          stick.style.top = (t.clientY - STICK_R) + 'px';
          stick.classList.add('active');
        } else if (!onUI && lookTouch === null && !onLeft) {
          lookTouch = t.identifier;
          lookLastX = t.clientX; lookLastY = t.clientY;
        }
      }
    }, { passive: true });

    let lookLastX = 0, lookLastY = 0;
    window.addEventListener('touchmove', (e) => {
      if (!ctl.enabled) return;
      for (const t of e.changedTouches) {
        if (t.identifier === stickTouch) {
          let dx = t.clientX - stickCx, dy = t.clientY - stickCy;
          const d = Math.hypot(dx, dy);
          if (d > STICK_R) { dx = dx / d * STICK_R; dy = dy / d * STICK_R; }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          ctl.moveX = dx / STICK_R;
          ctl.moveZ = -dy / STICK_R;
        } else if (t.identifier === lookTouch) {
          ctl.lookDX += (t.clientX - lookLastX) * 0.005;
          ctl.lookDY += (t.clientY - lookLastY) * 0.005;
          lookLastX = t.clientX; lookLastY = t.clientY;
        }
      }
    }, { passive: true });

    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickTouch) {
          stickTouch = null;
          ctl.moveX = 0; ctl.moveZ = 0;
          knob.style.transform = 'translate(0,0)';
          stick.classList.remove('active');
        }
        if (t.identifier === lookTouch) lookTouch = null;
      }
    };
    window.addEventListener('touchend', endTouch, { passive: true });
    window.addEventListener('touchcancel', endTouch, { passive: true });
  }

  ctl.update = () => {
    if (!IS_TOUCH) readKeyboard();
  };

  ctl.consumeFrame = () => {
    ctl.lookDX = 0; ctl.lookDY = 0;
    ctl.firePressed = false;
    ctl.jumpPressed = false;
    ctl.interactPressed = false;
    ctl.buildTogglePressed = false;
    ctl.slotPressed = -1;
    ctl.piecePressed = null;
    ctl.matCyclePressed = false;
  };

  return ctl;
}
