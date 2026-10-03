// Boot + main loop. Fixed-timestep simulation (60 Hz) decoupled from rendering;
// the renderer, audio and UI all read the same Game and consume its event queue.

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
const view = { focusSocket: -1, previewType: '', showFocusInCombat: false };
const sprites = new SpriteBank('assets/art/');
const renderer = new Renderer(canvas, game, view, settings, sprites);
const input = new Input(canvas, settings);
input.bindTouchControls(app);
// Art loads in the background; the placeholder renderer covers anything not delivered yet.
sprites.load().then(() => {
  renderer.onArtLoaded();
  if (sprites.loaded) console.info(`[art] ${sprites.loaded} sprites loaded`);
});
const audio = new Audio(settings);
const ui = new UI({ game, view, audio, settings, storage, renderer, input, onSettings: applySettings });

const coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)') : { matches: false };

function touchMode() {
  if (settings.touch === 'on') return true;
  if (settings.touch === 'off') return false;
  return coarse.matches || input.lastDevice === 'touch';
}

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

// Board insets are fixed per input mode (not measured from the HUD, which is hidden on the
// title screen) so the reef never jumps around between menus and combat.
function layout() {
  const touch = touchMode();
  app.classList.toggle('touch', touch);
  const safe = safeArea();
  renderer.setInsets({ top: safe.top + 104, bottom: safe.bottom + (touch ? 168 : 56) });
  if (isPhoneLandscape() && game.phase === PHASE.COMBAT && !game.paused) ui.openPause();
}

function applySettings() {
  storage.saveSettings(settings);
  audio.applySettings();
  app.classList.toggle('tiltshift', !!settings.tiltShift);
  debugEl.hidden = !settings.showFps && !ui.debug;
  layout();
  ui.renderedKey = '';
}

applySettings();
renderer.resize();
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
  if (document.hidden && game.phase === PHASE.COMBAT && !game.paused) ui.openPause();
  audio.suspend(document.hidden);
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// ------------------------------------------------------------ loop

let last = performance.now();
let acc = 0;
let pausedFrames = 0;
let lastTouch = touchMode();
const perf = { ema: 16, simUs: 0, frames: 0, fpsT: 0, fps: 60, slowT: 0, fastT: 0 };

function syncCombatInput(presses) {
  const gi = game.input;
  const active = game.phase === PHASE.COMBAT && !game.paused && ui.stack.length === 0;
  if (!active) {
    gi.left = gi.right = gi.plus = gi.minus = false;
    gi.moveX = -1;
    return;
  }
  let plusEdge = false, minusEdge = false;
  for (const a of presses) {
    if (a === 'plus') plusEdge = true;
    else if (a === 'minus') minusEdge = true;
  }
  gi.left = input.held('left');
  gi.right = input.held('right');
  // a press+release inside one frame still counts as a shot
  gi.plus = input.held('plus') || plusEdge;
  gi.minus = input.held('minus') || minusEdge;
  if (plusEdge) gi.plusPressed = true;
  if (minusEdge) gi.minusPressed = true;
  gi.moveX = input.pointer.down ? renderer.screenToWorld(input.pointer.x, input.pointer.y).x : -1;
}

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
  const presses = input.consume();
  ui.handle(presses);
  ui.handleTaps(input.consumeTaps());
  ui.handleHover(input.hover.x, input.hover.y);
  syncCombatInput(presses);

  const t0 = performance.now();
  const speed = game.phase === PHASE.COMBAT ? game.speed : 1;
  acc += dt * speed;
  let steps = 0;
  const maxSteps = SIM.MAX_STEPS * speed;
  while (acc >= SIM.DT && steps < maxSteps) {
    game.update(SIM.DT);
    acc -= SIM.DT;
    steps++;
  }
  if (steps >= maxSteps) acc = 0; // drop backlog instead of spiralling
  const simMs = performance.now() - t0;

  renderer.consume(game.events);
  audio.consume(game.events);
  ui.consume(game.events);
  game.events.clear();

  if (game.saveRequest) {
    if (game.saveRequest === 'save') storage.saveRun(game.serialize());
    else storage.clearRun();
    game.saveRequest = '';
  }
  if (game.metaDirty) {
    storage.saveMeta(game.meta);
    game.metaDirty = false;
  }
  const t = touchMode();
  if (t !== lastTouch) {
    lastTouch = t;
    layout();
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
        `E${game.enemies.length} P${game.projectiles.length} FX${renderer.particles.length} · q${renderer.quality}`;
    }
  }
}

requestAnimationFrame((t) => {
  last = t;
  frame(t);
});

// handy for debugging and automated smoke tests
window.reef = { game, renderer, ui, input, audio, settings, sprites };
