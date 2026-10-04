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

const artIcon = (name, alt = '') => `<img src="assets/art/gloss/${name}.webp" alt="${alt}" draggable="false">`;
const COIN = artIcon('pearl');
// Small control symbols are native vectors; decorative artwork uses the sprite set.
const controlIcon = (name) => {
  const paths = { play: 'M17 10 36 24 17 38Z', replay: 'M14 16A15 15 0 1 1 10 28M14 7v12H3', help: 'M18 16a7 7 0 1 1 10 7c-4 2-4 4-4 7M24 36v1', settings: 'M24 9v5m0 20v5M9 24h5m20 0h5M13 13l4 4m14 14 4 4M13 35l4-4m14-14 4-4', home: 'M8 23 24 9l16 14M13 21v18h22V21M21 39V28h6v11', upgrade: 'M12 26 24 12l12 14M24 13v25' };
  return `<svg class="control-icon" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="control-glaze-${name}" x2="0" y2="1"><stop stop-color="#b4f6ff"/><stop offset=".3" stop-color="#28c9ff"/><stop offset="1" stop-color="#2665ef"/></linearGradient></defs><circle cx="24" cy="24" r="22" fill="url(#control-glaze-${name})" stroke="#e4fbff" stroke-width="2"/><path d="${paths[name]}" fill="${name === 'play' ? '#fff' : 'none'}" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 14Q24 3 37 14" fill="none" stroke="#fff" opacity=".45" stroke-width="3"/><circle cx="24" cy="24" r="8" fill="none" stroke="#fff" stroke-width="3" ${name !== 'settings' ? 'display="none"' : ''}/></svg>`;
};
const UPGRADE_ICONS = { shots: artIcon('bubbles'), fish: artIcon('school'), dmg: artIcon('bubbles'), rate: artIcon('fire') };

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
    this.rewardElapsed = 1;
    this.rewardLevel = 0;
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
    if (g.phase === PHASE.WON && this.rewardElapsed < 1) {
      this.rewardElapsed = Math.min(1,this.rewardElapsed + dt / .85);
      const reward = this.panel.querySelector('[data-reward]');
      if (reward) reward.textContent = String(Math.round(Number(reward.dataset.reward) * (1 - Math.pow(1-this.rewardElapsed,3))));
    }
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
    if (scr.id === 'won' && this.rewardLevel !== this.g.result?.level) {
      this.rewardLevel = this.g.result.level;
      this.rewardElapsed = 0;
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
      ${scr.title ? `<h2>${scr.cls === 'defeat' ? '<span>Your school</span><span>got eaten!</span>' : esc(scr.title)}</h2>` : ''}
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

  banner(title, sub, secs = 2.2, kind = '') {
    this.bannerEl.classList.toggle('boss-banner', kind === 'boss');
    this.bannerEl.classList.toggle('win-banner', kind === 'win');
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
        case 'win':
          this.banner('Boss defeated!', 'Your school made it!', 1.35, 'win');
          if (this.settings.haptics) haptic();
          this.hintT = 0; this.hintEl.classList.remove('show');
          break;
        case 'boss_stage': this.banner(BOSSES[e.s].name, bossTip(e.s), 2.2, 'boss'); break;
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
    this.setText('hud-coins', String(g.meta.coins + (g.phase === PHASE.PLAY ? g.coinsRun : 0)));
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
        sub: id === 'shots' ? `${1 + g.meta.up.shots} ${g.meta.up.shots === u.max ? 'shots · MAX' : `→ ${2 + g.meta.up.shots} shots per volley`}` : `${esc(u.desc)} <small>(Lv ${g.meta.up[id]})</small>`,
        right: cost == null ? 'MAX' : `${artIcon('pearl')} ${cost}`,
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
      html: `<div class="logo"><div class="l1">Reef Rumble</div><div class="l2">Coral Run</div></div>
        ${needsInstallHint() ? '<p class="install">For full-screen play: tap <b>Share</b> → <b>Add to Home Screen</b></p>' : ''}
        <p class="meta">${COIN} ${m.coins} · Best level ${m.best || 0} · v${VERSION}</p>`,
      items: [
        { label: `Play level ${m.level}`, sub: `Boss: ${esc(boss)}`, icon: controlIcon('play'), cls: 'go big', action: () => this.play() },
        { label: 'Upgrades', icon: controlIcon('upgrade'), right: `${COIN} ${m.coins}`, action: () => this.push(() => this.upgradeScreen()) },
        { label: 'Fish Skins', icon: artIcon('player-classic'), action: () => this.push(() => this.skinsScreen()) },
        { label: 'How to Play', icon: controlIcon('help'), action: () => this.push(() => this.howScreen()) },
        { label: 'Settings', icon: controlIcon('settings'), action: () => this.push(() => this.settingsScreen()) },
      ],
    };
  }

  upgradeScreen() {
    const items = this.upgradeItems();
    items.push({ label: 'Back', cls: 'small', action: () => this.pop() });
    return { id: 'upgrades', title: 'Upgrades', html: `<p class="balance">${COIN} ${this.g.meta.coins}</p>`, items, onBack: () => this.pop() };
  }

  endScreen(won) {
    const g = this.g, r = g.result || { coins: 0, fish: 0, level: g.level };
    const rows = [['Coins', `+${r.coins}${won && r.bonus ? ` (clear bonus ${r.bonus})` : ''}`]];
    if (won) rows.push(['Fish left', r.fish]);
    if (r.newSkin) rows.push(['New skin', SKINS[r.newSkin].name]);
    const next = won
      ? { label: `Next: level ${g.meta.level}`, icon: controlIcon('play'), cls: 'go big', action: () => this.play() }
      : { label: `Try level ${g.meta.level} again`, icon: controlIcon('replay'), cls: 'go big', action: () => this.play() };
    return {
      id: won ? 'won' : 'lost', cls: won ? 'victory' : 'defeat',
      title: won ? 'Boss defeated!' : 'Your school got eaten!',
      html: `${won ? `<p class="victory-caption">${esc(BOSSES[bossForLevel(r.level).id].name)} · Level ${r.level} cleared</p><div class="victory-stars" aria-hidden="true">★</div>` : '<p class="sub">Pick the blue gates, shoot the critters,<br>and upgrade your school.</p>'}
        ${won ? `<div class="win-reward" aria-label="${r.coins} coins earned">${artIcon('pearl')}<span>+<b data-reward="${r.coins}">${this.rewardElapsed < 1 ? 0 : r.coins}</b></span><small>Coins earned · includes ${r.bonus || 0} clear bonus</small></div><p class="victory-caption">${r.fish} fish made it home${r.newSkin ? ` · ${esc(SKINS[r.newSkin].name)} unlocked` : ''}</p>` : table(rows)}<p class="sub balance">Coins: ${artIcon('pearl')} <b>${g.meta.coins}</b></p>`,
      items: [next, ...this.upgradeItems(), { label: 'Title screen', cls: 'small', action: () => g.quitToTitle() }],
    };
  }

  pauseScreen() {
    const g = this.g;
    return {
      id: 'pause', title: 'Paused', pauseCloses: true,
      items: [
        { label: 'Resume', icon: controlIcon('play'), cls: 'go', action: () => this.closePause() },
        { label: 'Restart level', icon: controlIcon('replay'), action: () => {
          this.closePause();
          g.startLevel();
        } },
        { label: 'How to Play', icon: controlIcon('help'), action: () => this.push(() => this.howScreen()) },
        { label: 'Settings', icon: controlIcon('settings'), action: () => this.push(() => this.settingsScreen()) },
        { label: 'Quit to title', icon: controlIcon('home'), action: () => {
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
        label: SKINS[id].name, icon: artIcon('player-' + id), sub: have ? '' : `Locked — ${esc(SKINS[id].unlock)}`,
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
