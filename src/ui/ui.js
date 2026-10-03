// DOM overlay: HUD + every menu. Fully navigable with keyboard / gamepad
// (Left/Right/Up/Down + Confirm/Back) and clickable / tappable.
//
// Menus are plain data ({ title, items: [{ label, sub, right, disabled, action }] })
// rendered into #panel; styling lives in css/style.css.

import { PHASE } from '../core/game.js';
import { haptic } from '../input.js';
import { bossForLevel } from '../core/level.js';
import { UPGRADES, SKINS, HOW_TO_PLAY, BOSSES, VERSION } from '../config.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);

const COIN = '🪙';
const UPGRADE_ICONS = { fish: '🐟', dmg: '💪', rate: '🔥' };

export class UI {
  constructor({ game, audio, settings, input, onSettings }) {
    this.g = game;
    this.audio = audio;
    this.settings = settings;
    this.input = input;
    this.onSettings = onSettings;
    this.app = $('app');
    this.panel = $('panel');
    this.toastEl = $('toast');
    this.bannerEl = $('banner');
    this.hintEl = $('hint');
    this.stack = []; // overlay screens on top of the phase screen
    this.focus = 0;
    this.renderedKey = '';
    this.hudCache = Object.create(null);
    this.debug = false;
    this.toastT = 0;
    this.bannerT = 0;
    this.hintT = 0;
    this.currentScreen = null;

    this.panel.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) e.preventDefault(); // keep focus off buttons (Space/Enter go to the game)
    });
    this.panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      this.audio.unlock();
      if (this.settings.haptics && this.input.lastDevice === 'touch') haptic();
      const i = +b.dataset.i;
      this.focus = i;
      this.activate(i);
    });
    this.panel.addEventListener('pointermove', (e) => {
      const b = e.target.closest('[data-i]');
      if (b && +b.dataset.i !== this.focus && e.pointerType === 'mouse') {
        this.focus = +b.dataset.i;
        this.paintFocus();
      }
    });
  }

  // ------------------------------------------------------------ screen resolution

  topScreen() {
    if (this.stack.length) return this.stack[this.stack.length - 1];
    switch (this.g.phase) {
      case PHASE.TITLE: return this.titleScreen();
      case PHASE.WON: return this.endScreen(true);
      case PHASE.LOST: return this.endScreen(false);
      default: return null; // playing
    }
  }

  push(factory) {
    this.stack.push(factory);
    this.focus = 0;
    this.renderedKey = '';
  }

  pop() {
    this.stack.pop();
    this.focus = 0;
    this.renderedKey = '';
  }

  resolve(s) {
    return typeof s === 'function' ? s() : s;
  }

  // ------------------------------------------------------------ input

  handle(presses) {
    let backUsed = false;
    for (const a of presses) {
      if (a === 'debug') {
        this.debug = !this.debug;
        $('debug').hidden = !this.debug && !this.settings.showFps;
        continue;
      }
      const scr = this.resolve(this.topScreen());
      if (scr) {
        if (a === 'pause' && backUsed) continue;
        if (a === 'back') backUsed = true;
        this.menuAction(scr, a);
        continue;
      }
      if (a === 'pause' || a === 'back') {
        if (backUsed) continue;
        backUsed = true;
        this.openPause();
      }
    }
  }

  menuAction(scr, a) {
    const n = scr.items.length;
    if (a === 'left' || a === 'up') {
      if (n) {
        this.focus = (this.focus - 1 + n) % n;
        this.audio.ui('move');
        this.paintFocus();
      }
    } else if (a === 'right' || a === 'down') {
      if (n) {
        this.focus = (this.focus + 1) % n;
        this.audio.ui('move');
        this.paintFocus();
      }
    } else if (a === 'confirm') {
      this.audio.unlock();
      this.activate(this.focus);
    } else if (a === 'back' || (a === 'pause' && scr.pauseCloses)) {
      if (scr.onBack) {
        this.audio.ui('back');
        scr.onBack();
      }
    }
  }

  activate(i) {
    const scr = this.resolve(this.topScreen());
    if (!scr) return;
    const it = scr.items[i];
    if (!it) return;
    if (it.disabled) {
      if (it.why) this.toast(it.why);
      this.audio.ui('back');
      return;
    }
    this.audio.ui('confirm');
    it.action();
    this.renderedKey = '';
  }

  // ------------------------------------------------------------ per-frame

  update(dt) {
    const g = this.g;
    const key = `${g.phase}|${g.uiVersion}|${this.stack.length}|${g.paused}`;
    if (key !== this.renderedKey) {
      this.renderedKey = key;
      const scr = this.resolve(this.topScreen());
      this.currentScreen = scr;
      this.renderPanel(scr);
    }
    const scr = this.currentScreen;
    const playing = g.phase === PHASE.PLAY;
    this.app.classList.toggle('playing', playing);
    this.app.classList.toggle('in-run', g.phase !== PHASE.TITLE);
    this.app.classList.toggle('menu-open', !!scr);
    this.updateHud();
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastEl.classList.remove('show');
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.bannerEl.classList.remove('show');
    }
    if (this.hintT > 0) {
      this.hintT -= dt;
      // the hint goes away as soon as the player steers
      if (this.hintT <= 0 || g.input.targetX === g.input.targetX || g.input.left || g.input.right) {
        this.hintT = 0;
        this.hintEl.classList.remove('show');
      }
    }
  }

  renderPanel(scr) {
    if (!scr) {
      this.panel.className = 'hidden';
      this.panel.innerHTML = '';
      return;
    }
    if (this.focus >= scr.items.length) this.focus = Math.max(0, scr.items.length - 1);
    if (scr.focusDefault !== undefined && this.focus === 0) this.focus = scr.focusDefault;
    const items = scr.items.map((it, i) => {
      const cls = ['item', it.cls || '', it.disabled ? 'disabled' : '', i === this.focus ? 'focus' : ''].join(' ');
      return `<button type="button" tabindex="-1" class="${cls}" data-i="${i}">
        ${it.icon ? `<span class="icon">${it.icon}</span>` : ''}
        <span class="label">${esc(it.label)}</span>
        ${it.sub ? `<span class="sub">${it.sub}</span>` : ''}
        ${it.right ? `<span class="right">${it.right}</span>` : ''}
      </button>`;
    }).join('');
    this.panel.className = `panel modal ${scr.cls || ''}`;
    this.panel.innerHTML = `<div class="sheet">
      ${scr.title ? `<h2>${esc(scr.title)}</h2>` : ''}
      ${scr.html || ''}
      <div class="items list">${items}</div>
      ${scr.hint ? `<p class="hint">${scr.hint}</p>` : ''}</div>`;
  }

  paintFocus() {
    const btns = this.panel.querySelectorAll('[data-i]');
    btns.forEach((b) => b.classList.toggle('focus', +b.dataset.i === this.focus));
  }

  toast(msg, secs = 1.8) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastT = secs;
  }

  banner(title, sub, secs = 2.2) {
    this.bannerEl.innerHTML = `<div class="big">${esc(title)}</div>${sub ? `<div class="small">${esc(sub)}</div>` : ''}`;
    this.bannerEl.classList.add('show');
    this.bannerT = secs;
  }

  consume(q) {
    for (let i = 0; i < q.n; i++) {
      const e = q.items[i];
      switch (e.type) {
        case 'denied': this.toast(e.s); break;
        case 'level_start':
          this.banner(`Level ${e.a}`, 'Swipe to pick a gate!', 1.8);
          this.audio.setMusic('combat');
          if (e.a <= 3 || this.input.lastDevice === 'touch') {
            this.hintEl.classList.add('show');
            this.hintT = 4;
          }
          break;
        case 'phase':
          if (e.s !== PHASE.PLAY) {
            this.audio.setMusic('calm');
            this.bannerT = 0;
            this.bannerEl.classList.remove('show');
            this.hintT = 0;
            this.hintEl.classList.remove('show');
          }
          break;
        case 'boss_stage': this.banner(BOSSES[e.s].name, bossTip(e.s), 2.2); break;
        case 'buddy_join': this.toast(`A ${e.s} buddy joined your school!`, 1.6); break;
        case 'pause':
        case 'resume': this.renderedKey = ''; break;
      }
    }
  }

  setText(id, text) {
    if (this.hudCache[id] === text) return;
    this.hudCache[id] = text;
    $(id).textContent = text;
  }

  setStyle(id, prop, val) {
    const key = id + prop;
    if (this.hudCache[key] === val) return;
    this.hudCache[key] = val;
    $(id).style[prop] = val;
  }

  updateHud() {
    const g = this.g;
    this.setText('hud-level', `Level ${g.phase === PHASE.PLAY ? g.level : g.meta.level}`);
    this.setText('hud-coins', `${COIN} ${g.meta.coins + (g.phase === PHASE.PLAY ? g.coinsRun : 0)}`);
    this.setStyle('hud-progress', 'transform', `scaleX(${g.phase === PHASE.PLAY ? g.progress.toFixed(3) : 0})`);
  }

  // ------------------------------------------------------------ actions

  play() {
    this.stack.length = 0;
    this.audio.unlock();
    this.g.startLevel();
  }

  openPause() {
    if (this.g.phase !== PHASE.PLAY) return;
    this.g.setPaused(true);
    this.audio.suspend(false);
    this.push(() => this.pauseScreen());
  }

  closePause() {
    this.stack.length = 0;
    this.g.setPaused(false);
    this.renderedKey = '';
  }

  upgradeItems() {
    const g = this.g;
    return Object.keys(UPGRADES).map((id) => {
      const u = UPGRADES[id];
      const cost = g.upgradeCost(id);
      return {
        label: `${u.name}`,
        icon: UPGRADE_ICONS[id],
        sub: `${esc(u.desc)} <small>(Lv ${g.meta.up[id]})</small>`,
        right: cost == null ? 'MAX' : `${COIN} ${cost}`,
        disabled: cost == null || g.meta.coins < cost,
        why: cost == null ? 'Maxed out' : 'Not enough coins',
        cls: 'upgrade',
        action: () => g.buyUpgrade(id),
      };
    });
  }

  // ------------------------------------------------------------ screens

  titleScreen() {
    const g = this.g, m = g.meta;
    const boss = BOSSES[bossForLevel(m.level).id].name;
    return {
      id: 'title', cls: 'title', title: '',
      html: `<div class="logo"><div class="l1">Reef Rumble</div><div class="l2">Clay Coral Run</div></div>
        ${needsInstallHint() ? '<p class="install">📲 For full-screen play: tap <b>Share</b> → <b>Add to Home Screen</b></p>' : ''}
        <p class="meta">${COIN} ${m.coins} · Best level ${m.best || 0} · v${VERSION}</p>`,
      items: [
        { label: `Play level ${m.level}`, sub: `Boss: ${esc(boss)}`, icon: '▶', cls: 'go big', action: () => this.play() },
        { label: 'Upgrades', icon: '⬆', right: `${COIN} ${m.coins}`, action: () => this.push(() => this.upgradeScreen()) },
        { label: 'Fish Skins', icon: '🎨', action: () => this.push(() => this.skinsScreen()) },
        { label: 'How to Play', icon: '?', action: () => this.push(() => this.howScreen()) },
        { label: 'Settings', icon: '⚙', action: () => this.push(() => this.settingsScreen()) },
      ],
    };
  }

  upgradeScreen() {
    const items = this.upgradeItems();
    items.push({ label: 'Back', cls: 'small', action: () => this.pop() });
    return { id: 'upgrades', title: `Upgrades · ${COIN} ${this.g.meta.coins}`, items, onBack: () => this.pop() };
  }

  endScreen(won) {
    const g = this.g, r = g.result || { coins: 0, fish: 0, level: g.level };
    const rows = [[`${COIN} Coins`, `+${r.coins}${won && r.bonus ? ` (clear bonus ${r.bonus})` : ''}`]];
    if (won) rows.push(['🐟 Fish left', r.fish]);
    if (r.newSkin) rows.push(['🎨 New skin', SKINS[r.newSkin].name]);
    const next = won
      ? { label: `Next: level ${g.meta.level}`, icon: '▶', cls: 'go big', action: () => this.play() }
      : { label: `Try level ${g.meta.level} again`, icon: '↻', cls: 'go big', action: () => this.play() };
    return {
      id: won ? 'won' : 'lost', cls: won ? 'victory' : 'defeat',
      title: won ? `Level ${r.level} cleared!` : 'Your school got eaten!',
      html: `${won ? '' : '<p class="sub">Pick the blue gates, shoot the critters before they reach you, and spend coins on upgrades.</p>'}
        ${table(rows)}<p class="sub">Coins: ${COIN} ${g.meta.coins}</p>`,
      items: [next, ...this.upgradeItems(), { label: 'Title screen', cls: 'small', action: () => g.quitToTitle() }],
    };
  }

  pauseScreen() {
    const g = this.g;
    return {
      id: 'pause', title: 'Paused', pauseCloses: true,
      items: [
        { label: 'Resume', icon: '▶', cls: 'go', action: () => this.closePause() },
        { label: 'Restart level', icon: '↻', action: () => {
          this.closePause();
          g.startLevel();
        } },
        { label: 'How to Play', icon: '?', action: () => this.push(() => this.howScreen()) },
        { label: 'Settings', icon: '⚙', action: () => this.push(() => this.settingsScreen()) },
        { label: 'Quit to title', icon: '⌂', action: () => {
          this.closePause();
          g.quitToTitle();
        } },
      ],
      onBack: () => this.closePause(),
    };
  }

  settingsScreen() {
    const s = this.settings;
    const flip = (k) => () => {
      s[k] = !s[k];
      this.onSettings();
    };
    const vols = [0, 0.25, 0.5, 0.75, 1];
    return {
      id: 'settings', title: 'Settings',
      items: [
        { label: 'Music', right: s.music ? 'On' : 'Off', action: flip('music') },
        { label: 'Sound effects', right: s.sfx ? 'On' : 'Off', action: flip('sfx') },
        { label: 'Volume', right: `${Math.round(s.volume * 100)}%`, action: () => {
          s.volume = vols[(vols.indexOf(s.volume) + 1) % vols.length];
          this.onSettings();
        } },
        { label: 'Screen shake', right: s.shake ? 'On' : 'Off', action: flip('shake') },
        { label: 'Stop-motion animation (12 fps)', right: s.stopMotion ? 'On' : 'Off', action: flip('stopMotion') },
        { label: 'Haptics', sub: 'Buttons tick (iPhone iOS 18+, Android)', right: s.haptics ? 'On' : 'Off', action: flip('haptics') },
        { label: 'Show FPS', right: s.showFps ? 'On' : 'Off', action: flip('showFps') },
        { label: 'Back', cls: 'small', action: () => this.pop() },
      ],
      onBack: () => this.pop(),
    };
  }

  howScreen() {
    return {
      id: 'how', title: 'How to Play', cls: 'how',
      html: table(HOW_TO_PLAY),
      items: [{ label: 'Got it', cls: 'go', action: () => this.pop() }],
      onBack: () => this.pop(),
    };
  }

  skinsScreen() {
    const g = this.g;
    const items = Object.keys(SKINS).map((id) => {
      const have = g.meta.skins.includes(id);
      return {
        label: SKINS[id].name, sub: have ? '' : `Locked — ${esc(SKINS[id].unlock)}`,
        right: g.meta.skin === id ? '✔' : '', disabled: !have, why: SKINS[id].unlock,
        action: () => g.setSkin(id),
      };
    });
    items.push({ label: 'Back', cls: 'small', action: () => this.pop() });
    return { id: 'skins', title: 'Fish Skins', items, onBack: () => this.pop() };
  }
}

// ------------------------------------------------------------ helpers

// iPhone/iPad Safari has no install prompt: show a hint until launched from the Home Screen.
function needsInstallHint() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  return ios && !standalone;
}

function table(rows) {
  return `<table class="stats">${rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table>`;
}

function bossTip(id) {
  switch (id) {
    case 'chef': return 'Dodge the red ink circles!';
    case 'sharky': return 'Get out of the red lane before he charges!';
    case 'queen': return 'Stars rain down — find the gap!';
    case 'kitty': return 'Paw swipes hit half the road — switch sides!';
    default: return '';
  }
}
