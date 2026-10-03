// DOM overlay: HUD + every menu. Fully navigable with keyboard / gamepad
// (Left/Right/Up/Down + Confirm/Back) and clickable / tappable.
//
// Menus are plain data ({ title, items: [{ label, sub, right, disabled, action }] })
// rendered into #panel; styling lives in css/style.css so the art pass can
// restyle everything (clay buttons, cardboard signs) without touching logic.

import { PHASE } from '../core/game.js';
import { haptic } from '../input.js';
import { towerMaxHp } from '../core/towers.js';
import { isBossWave, bossForWave } from '../core/waves.js';
import {
  TOWERS, UPGRADES, UNLOCKS, FORKS, SKINS, HOW_TO_PLAY, WAVES, PLAYER, BOSSES, VERSION,
} from '../config.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);

const SHELL = '🐚';
const PEARL = '⚪';

export class UI {
  constructor({ game, view, audio, settings, storage, renderer, input, onSettings }) {
    this.g = game;
    this.view = view;
    this.audio = audio;
    this.settings = settings;
    this.storage = storage;
    this.renderer = renderer;
    this.input = input;
    this.onSettings = onSettings;
    this.app = $('app');
    this.panel = $('panel');
    this.toastEl = $('toast');
    this.bannerEl = $('banner');
    this.stack = []; // overlay screens on top of the phase screen
    this.focus = 0;
    this.renderedKey = '';
    this.buildFocus = 0;
    this.placeFocus = -1;
    this.hudCache = Object.create(null);
    this.debug = false;
    this.toastT = 0;
    this.bannerT = 0;
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
      case PHASE.FORK: return this.forkScreen();
      case PHASE.DRAFT: return this.draftScreen();
      case PHASE.PLACE: return this.placeScreen();
      case PHASE.BUILD: return this.buildScreen();
      case PHASE.WAVE_END: return this.waveEndScreen();
      case PHASE.VICTORY: return this.victoryScreen();
      case PHASE.DEFEAT: return this.defeatScreen();
      default: return null; // combat
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

  // stack entries are factories so they re-evaluate (costs, levels) when redrawn
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
      // combat (no menu open)
      if (a === 'pause' || a === 'back') {
        if (backUsed) continue;
        backUsed = true;
        this.openPause();
      } else if (a === 'wash') {
        this.g.useReefWash();
      } else if (a === 'speed') {
        this.toggleSpeed();
      }
    }
  }

  handleTaps(taps) {
    if (!taps.length) return;
    this.audio.unlock();
    const g = this.g;
    if (this.stack.length) return;
    for (const t of taps) {
      const w = this.renderer.screenToWorld(t.x, t.y);
      const so = this.socketAt(w.x, w.y);
      if (!so) continue;
      if (g.phase === PHASE.PLACE) {
        if (!so.tower) {
          this.placeFocus = so.i;
          g.placePending(so.i);
        }
      } else if (g.phase === PHASE.BUILD) {
        this.buildFocus = so.i;
        this.openSocket(so.i);
      }
    }
  }

  handleHover(x, y) {
    const g = this.g;
    if (x < 0 || this.stack.length) return;
    if (g.phase !== PHASE.BUILD && g.phase !== PHASE.PLACE) return;
    const w = this.renderer.screenToWorld(x, y);
    const so = this.socketAt(w.x, w.y);
    if (!so) return;
    if (g.phase === PHASE.BUILD && this.buildFocus !== so.i) {
      this.buildFocus = so.i;
      this.renderedKey = '';
    } else if (g.phase === PHASE.PLACE && !so.tower && this.placeFocus !== so.i) {
      this.placeFocus = so.i;
      this.renderedKey = '';
    }
  }

  socketAt(x, y) {
    let best = null, bd = 48 * 48;
    for (const so of this.g.sockets) {
      const d = (so.x - x) ** 2 + (so.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = so;
      }
    }
    return best;
  }

  menuAction(scr, a) {
    if (scr.onKey && scr.onKey(a)) return;
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
    } else if (a === 'pause' && !this.stack.length && this.g.phase !== PHASE.TITLE) {
      this.openPause();
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
    const key = `${g.phase}|${g.uiVersion}|${this.stack.length}|${this.buildFocus}|${this.placeFocus}|${g.paused}`;
    if (key !== this.renderedKey) {
      this.renderedKey = key;
      const scr = this.resolve(this.topScreen());
      this.currentScreen = scr;
      this.renderPanel(scr);
    }
    const scr = this.currentScreen;
    this.syncView(scr);
    this.updateHud();
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastEl.classList.remove('show');
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.bannerEl.classList.remove('show');
    }
  }

  syncView(scr) {
    const g = this.g, v = this.view;
    v.previewType = '';
    v.focusSocket = -1;
    if (g.phase === PHASE.PLACE && !this.stack.length) {
      if (this.placeFocus < 0 || g.sockets[this.placeFocus].tower) this.placeFocus = this.firstEmpty();
      v.focusSocket = this.placeFocus;
      v.previewType = g.pendingTower;
    } else if (g.phase === PHASE.BUILD) {
      const sock = scr && scr.socket != null ? scr.socket : this.buildFocus < g.sockets.length ? this.buildFocus : -1;
      v.focusSocket = sock;
      if (scr && scr.previewTypes) v.previewType = scr.previewTypes[this.focus] || '';
    }
    const combat = g.phase === PHASE.COMBAT;
    this.app.classList.toggle('in-combat', combat);
    this.app.classList.toggle('in-run', g.phase !== PHASE.TITLE);
    this.app.classList.toggle('menu-open', !!scr && !scr.bar);
    this.app.classList.toggle('bar-open', !!scr && !!scr.bar);
  }

  firstEmpty() {
    // prefer the empty socket with the best path coverage
    let best = -1, bv = -1;
    for (const so of this.g.sockets) if (!so.tower && so.coverage > bv) {
      bv = so.coverage;
      best = so.i;
    }
    return best;
  }

  // ------------------------------------------------------------ rendering

  renderPanel(scr) {
    if (!scr) {
      this.panel.className = 'hidden';
      this.panel.innerHTML = '';
      return;
    }
    if (scr.focusOverride !== undefined) this.focus = scr.focusOverride;
    else if (this.focus >= scr.items.length) this.focus = Math.max(0, scr.items.length - 1);
    const layout = scr.layout || 'list';
    const items = scr.items.map((it, i) => {
      const cls = ['item', it.cls || '', it.disabled ? 'disabled' : '', i === this.focus ? 'focus' : ''].join(' ');
      return `<button type="button" tabindex="-1" class="${cls}" data-i="${i}">
        ${it.icon ? `<span class="icon">${it.icon}</span>` : ''}
        <span class="label">${esc(it.label)}</span>
        ${it.sub ? `<span class="sub">${it.sub}</span>` : ''}
        ${it.right ? `<span class="right">${it.right}</span>` : ''}
      </button>`;
    }).join('');
    this.panel.className = `panel ${scr.bar ? 'bar' : 'modal'} ${scr.cls || ''}`;
    this.panel.innerHTML = `<div class="sheet">
      ${scr.title ? `<h2>${esc(scr.title)}</h2>` : ''}
      ${scr.html || ''}
      <div class="items ${layout}">${items}</div>
      ${scr.hint ? `<p class="hint">${scr.hint}</p>` : ''}</div>`;
  }

  paintFocus() {
    const btns = this.panel.querySelectorAll('[data-i]');
    btns.forEach((b) => b.classList.toggle('focus', +b.dataset.i === this.focus));
    const scr = this.currentScreen;
    if (scr && scr.onFocus) scr.onFocus(this.focus);
  }

  toast(msg, secs = 1.8) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastT = secs;
  }

  banner(title, sub, secs = 2.4) {
    this.bannerEl.innerHTML = `<div class="big">${esc(title)}</div>${sub ? `<div class="small">${esc(sub)}</div>` : ''}`;
    this.bannerEl.classList.add('show');
    this.bannerT = secs;
  }

  consume(q) {
    const g = this.g;
    for (let i = 0; i < q.n; i++) {
      const e = q.items[i];
      switch (e.type) {
        case 'denied': this.toast(e.s); break;
        case 'wave_start': {
          const boss = e.b ? BOSSES[bossForWave(e.a).id].name : '';
          this.banner(boss ? `Boss Wave ${e.a}` : `Wave ${e.a}`, boss || g.mods.name);
          this.audio.setMusic('combat');
          break;
        }
        case 'phase':
          if (e.s !== PHASE.COMBAT) this.audio.setMusic('calm');
          if (e.s === PHASE.PLACE) this.placeFocus = -1;
          break;
        case 'boss_spawn': this.banner(BOSSES[e.s].name, bossTip(e.s), 3); break;
        case 'boss_defeat': this.banner(`${BOSSES[e.s].name} defeated!`, `+${e.a} pearls  +${e.b} shells`, 3); break;
        case 'boss_phase': this.toast('The boss is getting serious!'); break;
        case 'tower_unlocked': this.toast(`${TOWERS[e.s].name} tower unlocked!`, 2.5); break;
        case 'reef_wash': this.toast('Reef Wash! All debuffs cleared.'); break;
        case 'meter_empty': this.flashMeter(); break;
        case 'player_hit':
          if (e.a <= 0) this.toast('Knocked out! Respawning…', 2);
          break;
        case 'pause':
        case 'resume': this.renderedKey = ''; break;
      }
    }
  }

  flashMeter() {
    const m = $('meter');
    m.classList.remove('flash');
    void m.offsetWidth;
    m.classList.add('flash');
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

  setHidden(id, hidden) {
    const key = id + 'hidden';
    if (this.hudCache[key] === hidden) return;
    this.hudCache[key] = hidden;
    $(id).hidden = hidden;
  }

  updateHud() {
    const g = this.g, p = g.player, h = g.heart;
    if (g.phase === PHASE.TITLE) return;
    this.setText('hud-wave', g.endless && g.wave > WAVES.total ? `Wave ${g.wave} ∞` : `Wave ${g.wave}/${WAVES.total}`);
    const mod = g.phase === PHASE.COMBAT ? g.mods : g.fork;
    this.setText('hud-mod', mod && mod.id !== 'none' ? mod.name : 'Open Reef');
    this.setText('hud-shells', `${SHELL} ${g.shells}`);
    this.setText('hud-pearls', `${PEARL} ${g.pearls}`);
    this.setStyle('heart-fill', 'transform', `scaleX(${(h.hp / h.maxHp).toFixed(3)})`);
    this.setText('heart-txt', `Coral Heart ${Math.ceil(h.hp)}/${h.maxHp}`);
    const combat = g.phase === PHASE.COMBAT;
    if (combat) {
      const meterMax = g.stats.meterMax;
      this.setStyle('meter-fill', 'transform', `scaleX(${(p.meter / meterMax).toFixed(3)})`);
      this.setStyle('meter-plus', 'left', `${((PLAYER.plusCost / meterMax) * 100).toFixed(1)}%`);
      this.setText('hud-hearts', p.alive ? '♥'.repeat(Math.max(0, p.hearts)) + '♡'.repeat(Math.max(0, p.maxHearts - p.hearts)) : `respawn ${Math.ceil(p.deadT)}`);
      this.setText('hud-wash', `Wash ×${g.reefWash}`);
      this.setText('hud-speed', `${g.speed}×`);
      this.setText('hud-left', `${g.enemiesRemaining} left`);
    }
    const b = g.boss;
    this.setHidden('bossbar', !(combat && b && b.alive));
    if (combat && b && b.alive) {
      this.setText('boss-name', BOSSES[b.bossId].name + (b.laps ? ' (angry!)' : ''));
      this.setStyle('boss-fill', 'transform', `scaleX(${(b.hp / b.maxHp).toFixed(3)})`);
      this.setStyle('boss-shield', 'transform', `scaleX(${b.maxShield ? (b.shield / b.maxShield).toFixed(3) : 0})`);
    }
  }

  // ------------------------------------------------------------ actions

  toggleSpeed() {
    const g = this.g;
    g.speed = g.speed === 1 ? 2 : 1;
    this.toast(`Speed ${g.speed}×`, 0.8);
  }

  openPause() {
    if (this.g.phase === PHASE.TITLE) return;
    this.g.setPaused(true);
    this.audio.suspend(false);
    this.push(() => this.pauseScreen());
  }

  closePause() {
    this.stack.length = 0;
    this.g.setPaused(false);
    this.renderedKey = '';
  }

  openSocket(i) {
    this.audio.ui('confirm');
    this.push(() => this.socketScreen(i));
  }

  // ------------------------------------------------------------ screens

  titleScreen() {
    const g = this.g;
    const save = this.storage.loadRun();
    const items = [];
    if (save) items.push({ label: 'Continue', sub: `Wave ${save.wave}${save.endless ? ' (Endless)' : ''}`, icon: '▶', action: () => this.continueRun() });
    items.push({ label: 'New Reef Run', sub: '20 waves, 4 bosses', icon: '🐠', action: () => this.newRun(false) });
    if (g.meta.endlessUnlocked) items.push({ label: 'Endless Reef', sub: `Best: wave ${g.meta.bestEndless || 0}`, icon: '∞', action: () => this.newRun(true) });
    items.push({ label: 'Fish Skins', icon: '🎨', action: () => this.push(() => this.skinsScreen()) });
    items.push({ label: 'How to Play', icon: '?', action: () => this.push(() => this.howScreen()) });
    items.push({ label: 'Settings', icon: '⚙', action: () => this.push(() => this.settingsScreen()) });
    return {
      id: 'title', cls: 'title', title: '',
      html: `<div class="logo"><div class="l1">Reef Rumble</div><div class="l2">Clay Coral Defense</div></div>
        ${needsInstallHint() ? '<p class="install">📲 For full-screen play: tap <b>Share</b> → <b>Add to Home Screen</b></p>' : ''}
        <p class="meta">Best wave ${g.meta.bestWave || 0} · Wins ${g.meta.wins || 0} · v${VERSION}</p>`,
      items,
    };
  }

  newRun(endless) {
    this.storage.clearRun();
    this.stack.length = 0;
    this.g.newRun({ endless });
    this.audio.unlock();
    this.audio.setMusic('calm');
  }

  continueRun() {
    const data = this.storage.loadRun();
    const r = data ? this.g.deserialize(data) : { ok: false };
    if (!r.ok) {
      this.storage.clearRun();
      this.toast('Save could not be loaded');
      this.renderedKey = '';
      return;
    }
    this.stack.length = 0;
    this.audio.setMusic('calm');
  }

  forkScreen() {
    const g = this.g;
    const forks = g.forkOptions.map((id) => FORKS.find((f) => f.id === id));
    const boss = isBossWave(g.wave) ? BOSSES[bossForWave(g.wave).id].name : '';
    return {
      id: 'fork', cls: 'fork', layout: 'row', title: `The reef forks — Wave ${g.wave}`,
      html: boss ? `<p class="warn">⚠ Boss ahead: ${esc(boss)}</p>` : '<p class="sub">Choose a path. It changes the next wave.</p>',
      items: forks.map((f, i) => ({
        label: `${i === 0 ? '◀ Left' : 'Right ▶'}: ${f.name}`,
        sub: esc(f.desc),
        cls: 'card',
        action: () => g.chooseFork(i),
      })),
      onKey: (a) => {
        if (a === 'left' || a === 'right') {
          const want = a === 'left' ? 0 : 1;
          if (this.focus === want) return true;
          this.focus = want;
          this.audio.ui('move');
          this.paintFocus();
          return true;
        }
        if (a === 'back') {
          this.openPause();
          return true;
        }
        return false;
      },
    };
  }

  draftScreen() {
    const g = this.g;
    const skip = g.skipCapsuleValue();
    const items = g.draftOptions.map((type, i) => {
      const d = TOWERS[type];
      return {
        label: d.name,
        icon: towerIcon(type),
        sub: `${esc(d.desc)}<br><small>${statLine(type, 0)}</small>`,
        right: `free (worth ${d.cost})`,
        cls: 'card capsule',
        action: () => g.chooseDraft(i),
      };
    });
    const full = !g.hasEmptySocket();
    items.push({ label: `Take ${skip} shells instead`, cls: 'small', action: () => g.chooseDraft(-1) });
    return {
      id: 'draft', cls: 'draft', layout: 'row', title: g.wave === 1 ? 'Pick your first tower' : 'Pick a tower capsule',
      html: full ? '<p class="warn">All sockets are full — any pick converts to shells.</p>' : '',
      items,
      onBack: () => this.openPause(),
    };
  }

  placeScreen() {
    const g = this.g;
    const d = TOWERS[g.pendingTower];
    if (!d) return null;
    const so = g.sockets[this.placeFocus];
    return {
      id: 'place', bar: true, cls: 'place',
      html: `<div class="barinfo"><b>${towerIcon(g.pendingTower)} Place your ${esc(d.name)}</b>
        <span>◀ ▶ choose a coral socket · Confirm to place · or tap a socket</span>
        ${so ? `<span class="dim">Socket ${so.i + 1}: covers ${Math.round(so.coverage / 10)} m of path</span>` : ''}</div>`,
      items: [{ label: 'Place here', icon: '✔', cls: 'go', action: () => g.placePending(this.placeFocus) }],
      onKey: (a) => {
        if (a === 'left' || a === 'right' || a === 'up' || a === 'down') {
          this.placeFocus = this.stepSocket(this.placeFocus, a === 'right' || a === 'down' ? 1 : -1, true);
          this.audio.ui('move');
          return true;
        }
        if (a === 'back') {
          this.openPause();
          return true;
        }
        return false;
      },
    };
  }

  stepSocket(from, dir, emptyOnly) {
    const n = this.g.sockets.length;
    let i = from < 0 ? (dir > 0 ? -1 : 0) : from;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (!emptyOnly || !this.g.sockets[i].tower) return i;
    }
    return from;
  }

  buildScreen() {
    const g = this.g;
    const n = g.sockets.length;
    if (this.buildFocus > n + 2) this.buildFocus = n + 2;
    const onSocket = this.buildFocus < n;
    const so = onSocket ? g.sockets[this.buildFocus] : null;
    let info = '';
    if (so && so.tower) {
      const t = so.tower;
      info = `<b>${towerIcon(t.type)} ${esc(t.stats.name || t.def.name)} · Lv${t.level + 1}</b><span>${statLine(t.type, t.level)} · kills ${t.kills}</span>`;
    } else if (so) {
      info = `<b>Empty coral socket ${so.i + 1}</b><span>Confirm to build a tower here</span>`;
    } else {
      info = `<b>Ready for wave ${g.wave}${isBossWave(g.wave) ? ' — BOSS' : ''}</b><span>${esc(g.fork.name || '')}${g.fork.desc ? ' — ' + esc(g.fork.desc) : ''}</span>`;
    }
    const items = [
      { label: 'Shop', icon: '🛒', action: () => this.push(() => this.shopScreen()) },
      { label: 'Pearls', icon: PEARL, right: String(g.pearls), action: () => this.push(() => this.unlockScreen()) },
      { label: 'Start Wave', icon: '▶', cls: 'go', action: () => g.startWave() },
    ];
    const self = this;
    return {
      id: 'build', bar: true, cls: 'build',
      html: `<div class="barinfo">${info}<span class="dim">◀ ▶ select socket · ▲ buttons · Confirm</span></div>`,
      items,
      focusOverride: onSocket ? -1 : this.buildFocus - n,
      onKey(a) {
        const onSock = self.buildFocus < n;
        if (a === 'left' || a === 'right') {
          self.buildFocus = (self.buildFocus + (a === 'right' ? 1 : -1) + n + 3) % (n + 3);
          if (self.buildFocus >= n) self.focus = self.buildFocus - n;
          self.audio.ui('move');
          self.renderedKey = '';
          return true;
        }
        if (a === 'up' && onSock) {
          self.buildFocus = n + 2;
          self.focus = 2;
          self.renderedKey = '';
          return true;
        }
        if (a === 'down' && !onSock) {
          self.buildFocus = 0;
          self.renderedKey = '';
          return true;
        }
        if (a === 'up' || a === 'down') return true;
        if (a === 'confirm') {
          if (onSock) self.openSocket(self.buildFocus);
          else self.activate(self.buildFocus - n);
          return true;
        }
        if (a === 'back') {
          self.openPause();
          return true;
        }
        return false;
      },
      onFocus(i) {
        self.buildFocus = n + i;
        self.renderedKey = '';
      },
    };
  }

  socketScreen(i) {
    const g = this.g;
    const so = g.sockets[i];
    const back = () => this.pop();
    if (!so.tower) {
      const items = g.towerTypes.map((type) => {
        const d = TOWERS[type];
        const afford = g.shells >= d.cost;
        return {
          label: d.name, icon: towerIcon(type), sub: `${esc(d.desc)}<br><small>${statLine(type, 0)}</small>`,
          right: `${SHELL} ${d.cost}`, disabled: !afford, why: 'Not enough shells',
          action: () => {
            if (g.buyTower(type, i).ok) this.pop();
          },
        };
      });
      items.push({ label: 'Back', cls: 'small', action: back });
      return {
        id: 'sock-empty-' + i, socket: i, title: `Build on socket ${i + 1}`, items, onBack: back,
        previewTypes: g.towerTypes.slice(),
      };
    }
    const t = so.tower;
    const up = g.upgradeInfo(t);
    const items = [];
    if (up.max) items.push({ label: 'Fully evolved', disabled: true, why: 'Already at max level' });
    else {
      items.push({
        label: up.locked ? `Evolve: ${up.name}` : `Upgrade to ${up.name}`,
        icon: '⬆',
        sub: up.locked ? `Unlock "${esc(UNLOCKS['evo_' + t.type].name)}" with pearls first` : statLine(t.type, t.level + 1) + ` · HP ${towerMaxHp(t.def, t.level + 1)}`,
        right: `${SHELL} ${up.cost}`,
        disabled: up.locked || g.shells < up.cost,
        why: up.locked ? 'Unlock the evolution with pearls first' : 'Not enough shells',
        action: () => g.upgradeTower(i),
      });
    }
    items.push({ label: 'Sell', icon: '💰', right: `+${g.sellValue(t)}`, action: () => {
      if (g.sellTower(i).ok) this.pop();
    } });
    items.push({ label: 'Back', cls: 'small', action: back });
    return {
      id: `sock-${i}-${t.level}`, socket: i,
      title: `${t.stats.name || t.def.name} · Lv${t.level + 1}`,
      html: `<p class="sub">${esc(t.def.desc)}<br>${statLine(t.type, t.level)} · HP ${Math.ceil(t.hp)}/${t.maxHp} · kills ${t.kills}</p>`,
      items, onBack: back,
    };
  }

  shopScreen() {
    const g = this.g;
    const items = Object.keys(UPGRADES).map((id) => {
      const u = UPGRADES[id];
      const cost = g.upgradeCost(id);
      const lvl = u.consumable ? `${g.reefWash}/${u.max} held` : `Lv ${g.upgrades[id]}/${u.max}`;
      return {
        label: u.name, sub: `${esc(u.desc)} <small>(${lvl})</small>`,
        right: cost == null ? 'MAX' : `${SHELL} ${cost}`,
        disabled: cost == null || g.shells < cost,
        why: cost == null ? 'Maxed out' : 'Not enough shells',
        action: () => g.buyUpgrade(id),
      };
    });
    items.push({ label: 'Back', cls: 'small', action: () => this.pop() });
    return { id: 'shop', title: `Shell Shop · ${SHELL} ${g.shells}`, items, onBack: () => this.pop() };
  }

  unlockScreen() {
    const g = this.g;
    const items = Object.keys(UNLOCKS).map((id) => {
      const u = UNLOCKS[id];
      const have = !!g.unlocked[id];
      return {
        label: u.name, sub: esc(u.desc), right: have ? '✔' : `${PEARL} ${u.pearls}`,
        disabled: have || g.pearls < u.pearls, why: have ? 'Already unlocked' : 'Not enough pearls',
        cls: have ? 'owned' : '',
        action: () => g.buyUnlock(id),
      };
    });
    items.push({ label: 'Back', cls: 'small', action: () => this.pop() });
    return {
      id: 'unlocks', title: `Pearl Unlocks · ${PEARL} ${g.pearls}`, items, onBack: () => this.pop(),
      html: '<p class="sub">Pearls come from bosses, some forks, and perfect waves (no heart damage).</p>',
    };
  }

  waveEndScreen() {
    const g = this.g, s = g.waveSummary || {};
    const rows = [
      ['Enemies popped', s.kills],
      ['Shells earned', `+${s.shells} (wave bonus ${s.clearBonus})`],
    ];
    if (s.pearls) rows.push(['Pearls', `+${s.pearls}`]);
    if (s.perfect) rows.push(['Perfect wave!', 'Coral Heart untouched']);
    if (s.shellsStolen) rows.push(['Stolen by crabs', `-${s.shellsStolen}`]);
    if (s.bossDefeated) rows.push(['Boss', `${BOSSES[s.bossDefeated].name} defeated`]);
    if (s.unlockedTower) rows.push(['New tower', TOWERS[s.unlockedTower].name]);
    if (s.towersEaten) rows.push(['Swallowed (and spat out)', s.towersEaten]);
    if (s.newSkin) rows.push(['New skin', SKINS[s.newSkin].name]);
    return {
      id: 'waveEnd', title: `Wave ${s.wave} cleared!`,
      html: table(rows),
      items: [{ label: 'Continue', icon: '▶', cls: 'go', action: () => g.continueAfterWave() }],
      onBack: () => this.openPause(),
    };
  }

  victoryScreen() {
    const g = this.g;
    return {
      id: 'victory', cls: 'victory', title: 'Kraken Kitty is defeated!',
      html: `<p class="sub">The reef is safe. Endless Reef mode and new fish skins are unlocked.</p>${table([
        ['Total pops', g.runStats.kills], ['Shells earned', g.runStats.shells], ['Perfect waves', g.runStats.perfectWaves],
      ])}`,
      items: [
        { label: 'Keep going (Endless)', icon: '∞', cls: 'go', action: () => g.continueAfterWave() },
        { label: 'Back to title', action: () => g.quitToTitle() },
      ],
    };
  }

  defeatScreen() {
    const g = this.g;
    return {
      id: 'defeat', cls: 'defeat', title: 'The Coral Heart crumbled',
      html: `<p class="sub">You reached wave ${g.wave}${g.endless ? ' (Endless)' : ''}.</p>${table([
        ['Total pops', g.runStats.kills], ['Towers built', g.runStats.towersBuilt], ['Perfect waves', g.runStats.perfectWaves],
      ])}`,
      items: [
        { label: 'Try again', icon: '↻', cls: 'go', action: () => this.newRun(g.endless) },
        { label: 'Back to title', action: () => g.quitToTitle() },
      ],
    };
  }

  pauseScreen() {
    const g = this.g;
    const inCombat = g.phase === PHASE.COMBAT;
    return {
      id: 'pause', title: 'Paused', pauseCloses: true,
      items: [
        { label: 'Resume', icon: '▶', cls: 'go', action: () => this.closePause() },
        { label: 'How to Play', icon: '?', action: () => this.push(() => this.howScreen()) },
        { label: 'Settings', icon: '⚙', action: () => this.push(() => this.settingsScreen()) },
        {
          label: inCombat ? 'Restart from last save' : 'Restart run', icon: '↻',
          action: () => {
            this.closePause();
            if (inCombat && this.storage.loadRun()) this.continueRun();
            else this.newRun(g.endless);
          },
        },
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
    const touchModes = ['auto', 'on', 'off'];
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
        { label: 'Tilt-shift blur', sub: 'Pretty, costs GPU', right: s.tiltShift ? 'On' : 'Off', action: flip('tiltShift') },
        { label: 'Touch controls', right: s.touch, action: () => {
          s.touch = touchModes[(touchModes.indexOf(s.touch) + 1) % touchModes.length];
          this.onSettings();
        } },
        { label: 'Haptics', sub: 'Touch buttons tick (iPhone iOS 18+, Android)', right: s.haptics ? 'On' : 'Off', action: flip('haptics') },
        { label: 'Show FPS', right: s.showFps ? 'On' : 'Off', action: flip('showFps') },
        { label: 'Back', cls: 'small', action: () => this.pop() },
      ],
      onBack: () => this.pop(),
    };
  }

  howScreen() {
    return {
      id: 'how', title: 'How to Play', cls: 'how',
      html: table(HOW_TO_PLAY) + `<p class="sub">Gamepad: stick/d-pad move · A/RT Minus · X/LT Plus · Y Reef Wash · RB speed · Start pause.<br>
        Touch: hold ◀ ▶ (or drag on the reef) and the − + buttons.</p>`,
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

export function towerIcon(type) {
  return { fish: '🐠', octopus: '🐙', shark: '🦈', starfish: '⭐', puffer: '🐡', seahorse: '🌊', crab: '🦀' }[type] || '•';
}

function statLine(type, level) {
  const s = TOWERS[type].levels[level];
  const parts = [`Range ${s.range}`];
  if (type === 'puffer') parts.push(`Blast ${s.dmg}`, `every ${s.interval}s`);
  else if (type === 'starfish') parts.push(`Dmg ${s.dmg}`, `heals ${s.heal}/s`);
  else parts.push(`Dmg ${s.dmg}`, `${(1 / s.interval).toFixed(1)}/s`);
  if (s.name) parts.unshift(s.name);
  return parts.join(' · ');
}

function bossTip(id) {
  switch (id) {
    case 'chef': return 'Line up Minus shots on the hat for triple damage!';
    case 'sharky': return 'Starfish stars stun him mid-charge!';
    case 'queen': return 'Hit her when her arms open — or Plus her shut arms open.';
    case 'kitty': return 'Minus breaks tentacles. Plus pops her purr shield.';
    default: return '';
  }
}
