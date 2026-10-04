// Boot + main loop. Fixed-timestep simulation (60 Hz) decoupled from rendering;
// the renderer, audio and UI all read the same Game and consume its event queue.
//
// Steering: drag (or swipe) anywhere and the school follows your finger
// sideways, relative to where the drag started. Arrow keys / A D / gamepad also steer.

import { Game, PHASE } from './core/game.js';
import { SIM } from './config.js';
import { Renderer } from './render/renderer.js';
import { SpriteBank } from './render/sprites.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { UI } from './ui/ui.js';
import { storage } from './storage.js';

const app = document.getElementById('app');
const canvas = document.getElementById('game');
const debugEl = document.getElementById('debug');

const settings = storage.loadSettings();
const game = new Game({ meta: storage.loadMeta() });
const sprites = new SpriteBank('assets/art/');
const renderer = new Renderer(canvas, game, settings, sprites);
const input = new Input(canvas, settings);
input.bindTouchControls(app);
// Art loads in the background; placeholder shapes cover anything not delivered yet.
sprites.load().then(() => {
  renderer.onArtLoaded();
  if (sprites.loaded) console.info(`[art] ${sprites.loaded} sprites loaded`);
});
const audio = new Audio(settings);
const ui = new UI({ game, audio, settings, input, onSettings: applySettings });

const coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)') : { matches: false };

// Safe-area insets (Dynamic Island / home indicator), read through the same CSS
// variables the stylesheet uses. Re-read on every layout (rotation, PWA launch).
const safeProbe = document.createElement('div');
safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:var(--safe-top) 0 var(--safe-bottom) 0';
document.body.appendChild(safeProbe);
function safeArea() {
  const cs = getComputedStyle(safeProbe);
  return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
}

const isPhoneLandscape = () => coarse.matches && window.innerWidth > window.innerHeight && window.innerHeight < 520;

function layout() {
  const safe = safeArea();
  renderer.setInsets({ top: safe.top + 56, bottom: safe.bottom + 12 });
  if (isPhoneLandscape() && game.phase === PHASE.PLAY && !game.paused) ui.openPause();
}

function applySettings() {
  storage.saveSettings(settings);
  audio.applySettings();
  debugEl.hidden = !settings.showFps && !ui.debug;
  layout();
  ui.renderedKey = '';
}

applySettings();
renderer.resize();
document.fonts?.ready.then(() => { renderer.dirty = true; });
if (window.ResizeObserver) new ResizeObserver(() => {
  layout();
  renderer.resize();
}).observe(canvas);
else window.addEventListener('resize', () => renderer.resize());

// iOS only unlocks audio inside certain gestures; try them all.
let persisted = false;
const unlockAudio = () => {
  audio.unlock();
  if (!persisted && navigator.storage && navigator.storage.persist) {
    persisted = true;
    navigator.storage.persist().catch(() => {});
  }
};
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlockAudio, { passive: true });
// Block Safari pinch-zoom / double-tap zoom inside the game.
for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.phase === PHASE.PLAY && !game.paused) ui.openPause();
  audio.suspend(document.hidden);
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// ------------------------------------------------------------ steering

const DRAG_GAIN = 1.25; // school moves a bit further than the finger: less thumb travel
const drag = { active: false, startPx: 0, startX: 0 };

function syncSteering() {
  const gi = game.input;
  const active = game.phase === PHASE.PLAY && !game.paused && ui.stack.length === 0;
  if (!active) {
    gi.left = gi.right = false;
    gi.targetX = NaN;
    drag.active = false;
    return;
  }
  gi.left = input.held('left');
  gi.right = input.held('right');
  const p = input.pointer;
  if (p.down) {
    if (!drag.active) {
      drag.active = true;
      drag.startPx = p.x;
      drag.startX = game.school.x;
    }
    gi.targetX = drag.startX + ((p.x - drag.startPx) / renderer.pxPerUnit) * DRAG_GAIN;
  } else {
    drag.active = false;
    gi.targetX = NaN;
  }
}

// ------------------------------------------------------------ loop

let last = performance.now();
let acc = 0;
let pausedFrames = 0;
const perf = { ema: 16, simUs: 0, frames: 0, fpsT: 0, fps: 60, slowT: 0, fastT: 0 };

function adaptQuality(frameMs, dt) {
  perf.ema += (frameMs - perf.ema) * 0.05;
  if (perf.ema > 24) {
    perf.slowT += dt;
    perf.fastT = 0;
  } else if (perf.ema < 15) {
    perf.fastT += dt;
    perf.slowT = 0;
  }
  if (perf.slowT > 2 && renderer.quality > 0.5) {
    renderer.setQuality(0.5);
    perf.slowT = 0;
  } else if (perf.fastT > 8 && renderer.quality < 1) {
    renderer.setQuality(1);
    perf.fastT = 0;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  if (dt < 0) dt = 0;

  input.poll(dt);
  ui.handle(input.consume());
  input.consumeTaps();
  syncSteering();

  const t0 = performance.now();
  acc += dt;
  let steps = 0;
  while (acc >= SIM.DT && steps < SIM.MAX_STEPS) {
    game.update(SIM.DT);
    acc -= SIM.DT;
    steps++;
  }
  if (steps >= SIM.MAX_STEPS) acc = 0; // drop backlog instead of spiralling
  const simMs = performance.now() - t0;

  renderer.consume(game.events);
  audio.consume(game.events);
  ui.consume(game.events);
  game.events.clear();

  if (game.metaDirty) {
    storage.saveMeta(game.meta);
    game.metaDirty = false;
  }

  ui.update(dt);
  // While paused the reef is static: draw a couple of frames, then idle the GPU (battery).
  if (!game.paused || pausedFrames < 2 || renderer.dirty) {
    renderer.render(dt, Math.min(1, acc / SIM.DT));
    renderer.dirty = false;
  }
  pausedFrames = game.paused ? pausedFrames + 1 : 0;

  const frameMs = performance.now() - now;
  adaptQuality(frameMs, dt);
  perf.simUs += (simMs * 1000 - perf.simUs) * 0.05;
  perf.frames++;
  perf.fpsT += dt;
  if (perf.fpsT >= 0.5) {
    perf.fps = perf.frames / perf.fpsT;
    perf.frames = 0;
    perf.fpsT = 0;
    if (!debugEl.hidden) {
      debugEl.textContent = `${perf.fps.toFixed(0)} fps · frame ${perf.ema.toFixed(1)}ms · sim ${perf.simUs.toFixed(0)}µs · ` +
        `T${game.things.length} B${game.bullets.length} FX${renderer.particles.length} · q${renderer.quality}`;
    }
  }
}

requestAnimationFrame((t) => {
  last = t;
  frame(t);
});

// handy for debugging and automated smoke tests
window.reef = { game, renderer, ui, input, audio, settings, sprites };
