// Unified input: keyboard, gamepad, on-screen buttons and canvas pointer.
// Produces logical actions:
//   left right up down confirm back pause debug
// `held(action)` for continuous control, `consume()` for edge presses.
// Steering by drag reads `pointer` directly (see main.js).

const KEYMAP = {
  ArrowLeft: ['left'],
  KeyA: ['left'],
  ArrowRight: ['right'],
  KeyD: ['right'],
  ArrowUp: ['up'],
  KeyW: ['up'],
  ArrowDown: ['down'],
  KeyS: ['down'],
  Space: ['confirm'],
  Enter: ['confirm'],
  NumpadEnter: ['confirm'],
  KeyE: ['confirm'],
  Escape: ['back', 'pause'],
  Backspace: ['back'],
  KeyP: ['pause'],
  Backquote: ['debug'],
  F3: ['debug'],
};

// Standard-mapping gamepad buttons.
const PADMAP = {
  0: ['confirm'], // A
  1: ['back'], // B
  8: ['pause'], // Back/Select
  9: ['pause'], // Start
  12: ['up'],
  13: ['down'],
  14: ['left'],
  15: ['right'],
};

const NAV = new Set(['left', 'right', 'up', 'down']);

// Light haptic tick. Android: Vibration API. iOS 18+: Safari has no Vibration API,
// but toggling a native <input type="checkbox" switch> plays the system haptic,
// so we click a hidden one. Only works inside a user gesture (touch handlers).
let hapticLabel = null;
export function haptic() {
  if (navigator.vibrate) {
    navigator.vibrate(8);
    return;
  }
  if (!hapticLabel) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'haptic-switch';
    input.setAttribute('switch', '');
    input.style.display = 'none';
    hapticLabel = document.createElement('label');
    hapticLabel.htmlFor = input.id;
    hapticLabel.style.display = 'none';
    document.body.append(input, hapticLabel);
  }
  hapticLabel.click();
}

export class Input {
  constructor(canvas, settings = {}) {
    this.canvas = canvas;
    this.settings = settings;
    this.keyHeld = Object.create(null);
    this.padHeld = Object.create(null);
    this.touchHeld = Object.create(null);
    this.keysDown = new Set();
    this.presses = [];
    this.taps = [];
    this.pointer = { down: false, x: 0, y: 0, id: -1, type: 'mouse' };
    this.hover = { x: -1, y: -1 };
    this.touchButtons = new Map(); // pointerId -> action
    this.padPrev = Object.create(null);
    this.padRepeat = Object.create(null);
    this.lastDevice = 'keyboard';
    this.padConnected = false;

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });

    canvas.addEventListener('pointerdown', (e) => {
      this.lastDevice = e.pointerType === 'touch' ? 'touch' : 'mouse';
      this.pointer.down = true;
      this.pointer.id = e.pointerId;
      this.pointer.type = e.pointerType;
      this.setPointer(e);
      this.taps.push({ x: this.pointer.x, y: this.pointer.y });
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* not all browsers allow capture here */
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.pointer.down && e.pointerId === this.pointer.id) this.setPointer(e);
      const r = canvas.getBoundingClientRect();
      this.hover.x = e.clientX - r.left;
      this.hover.y = e.clientY - r.top;
    });
    const up = (e) => {
      if (e.pointerId === this.pointer.id) this.pointer.down = false;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', () => {
      this.hover.x = this.hover.y = -1;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('gamepadconnected', () => {
      this.padConnected = true;
    });
  }

  // On-screen buttons: any element with data-hold="action" (held while pressed)
  // or data-tap="action" (single press).
  bindTouchControls(root) {
    root.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('[data-hold],[data-tap]');
      if (!el) return;
      e.preventDefault();
      if (e.pointerType === 'touch') this.lastDevice = 'touch';
      if (e.pointerType === 'touch' && this.settings.haptics) haptic();
      const hold = el.dataset.hold;
      const tap = el.dataset.tap;
      if (hold) {
        for (const a of hold.split(' ')) {
          this.touchHeld[a] = (this.touchHeld[a] || 0) + 1;
          this.presses.push(a);
        }
        this.touchButtons.set(e.pointerId, hold);
        el.classList.add('down');
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      } else if (tap) {
        for (const a of tap.split(' ')) this.presses.push(a);
      }
    });
    const release = (e) => {
      const hold = this.touchButtons.get(e.pointerId);
      if (!hold) return;
      this.touchButtons.delete(e.pointerId);
      for (const a of hold.split(' ')) this.touchHeld[a] = Math.max(0, (this.touchHeld[a] || 0) - 1);
      const el = e.target.closest && e.target.closest('[data-hold]');
      if (el) el.classList.remove('down');
      root.querySelectorAll('[data-hold].down').forEach((b) => {
        if (![...this.touchButtons.values()].includes(b.dataset.hold)) b.classList.remove('down');
      });
    };
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setPointer(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = e.clientX - r.left;
    this.pointer.y = e.clientY - r.top;
  }

  onKey(e, down) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const acts = KEYMAP[e.code];
    if (!acts) return;
    e.preventDefault();
    this.lastDevice = 'keyboard';
    if (down) {
      if (e.repeat) {
        for (const a of acts) if (NAV.has(a)) this.presses.push(a);
        return;
      }
      this.keysDown.add(e.code);
      for (const a of acts) this.presses.push(a);
    } else this.keysDown.delete(e.code);
    this.recalcKeys();
  }

  recalcKeys() {
    for (const k in this.keyHeld) this.keyHeld[k] = false;
    for (const code of this.keysDown) for (const a of KEYMAP[code]) this.keyHeld[a] = true;
  }

  releaseAll() {
    this.keysDown.clear();
    this.recalcKeys();
    for (const k in this.touchHeld) this.touchHeld[k] = 0;
    this.touchButtons.clear();
    this.pointer.down = false;
  }

  held(a) {
    return !!(this.keyHeld[a] || this.padHeld[a] || this.touchHeld[a]);
  }

  poll(dt) {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let pad = null;
    for (const p of pads) if (p && p.connected) {
      pad = p;
      break;
    }
    for (const k in this.padHeld) this.padHeld[k] = false;
    if (!pad) return;
    const now = Object.create(null);
    const b = pad.buttons;
    for (const idx in PADMAP) {
      const btn = b[idx];
      if (btn && (btn.pressed || btn.value > 0.5)) for (const a of PADMAP[idx]) now[a] = true;
    }
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    if (ax < -0.45) now.left = true;
    if (ax > 0.45) now.right = true;
    if (ay < -0.6) now.up = true;
    if (ay > 0.6) now.down = true;
    let any = false;
    for (const a in now) {
      this.padHeld[a] = true;
      any = true;
      if (!this.padPrev[a]) {
        this.presses.push(a);
        this.padRepeat[a] = 0.4;
      } else if (NAV.has(a)) {
        this.padRepeat[a] -= dt;
        if (this.padRepeat[a] <= 0) {
          this.presses.push(a);
          this.padRepeat[a] = 0.12;
        }
      }
    }
    if (any) this.lastDevice = 'gamepad';
    this.padPrev = now;
  }

  consume() {
    const p = this.presses;
    this.presses = [];
    return p;
  }

  consumeTaps() {
    const t = this.taps;
    this.taps = [];
    return t;
  }
}
