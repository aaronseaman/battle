// Procedural placeholder audio: squishy pops, boings, marimba and ukulele plucks,
// all synthesized with WebAudio (no files to download). Every sound is
// rate-limited so 14 towers firing at once can't flood the mixer.
//
// Swap any voice for a sample later by replacing the matching method.

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.music = null;
    this.last = Object.create(null);
    this.noiseBuf = null;
    this.musicMode = '';
    this.userSuspended = false;
    this.nextNote = 0;
    this.step = 0;
    this.timer = 0;
  }

  // Must be called from a user gesture (browser autoplay policy).
  unlock() {
    if (this.ctx) {
      // iOS reports 'interrupted' after calls, Siri, or app switches
      if (this.ctx.state !== 'running' && !this.userSuspended) this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // iOS 17+: 'ambient' respects the silent switch and mixes with the player's own music
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    } catch {
      /* not supported */
    }
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    const comp = this.ctx.createDynamicsCompressor();
    comp.connect(this.master);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(comp);
    this.music = this.ctx.createGain();
    this.music.connect(comp);
    const n = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.applySettings();
    this.timer = setInterval(() => this.schedule(), 50);
  }

  applySettings() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.volume;
    this.sfx.gain.value = s.sfx ? 0.7 : 0;
    this.music.gain.value = s.music ? 0.22 : 0;
  }

  suspend(on) {
    this.userSuspended = on;
    if (!this.ctx) return;
    if (on) this.ctx.suspend().catch(() => {});
    else this.ctx.resume().catch(() => {});
  }

  ok(key, gap) {
    if (!this.ctx || !this.settings.sfx) return false;
    const t = this.ctx.currentTime;
    if (this.last[key] && t - this.last[key] < gap) return false;
    this.last[key] = t;
    return true;
  }

  // ------------------------------------------------------------ voices

  tone(freq, dur, type = 'sine', gain = 0.3, slideTo = 0, when = 0, out = this.sfx) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, freq, q = 1, gain = 0.3, when = 0) {
    const c = this.ctx, t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.3), t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  marimba(midi, when = 0, gain = 0.25, out = this.sfx) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    this.tone(f, 0.45, 'sine', gain, 0, when, out);
    this.tone(f * 4, 0.08, 'sine', gain * 0.35, 0, when, out);
  }

  pluck(midi, when = 0, gain = 0.15, out = this.sfx) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    fl.type = 'lowpass';
    fl.frequency.setValueAtTime(f * 6, t);
    fl.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(fl);
    fl.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.65);
  }

  strum(root, when = 0, out = this.sfx) {
    [0, 4, 7, 12].forEach((iv, i) => this.pluck(root + iv, when + i * 0.025, 0.12, out));
  }

  pop(pitch = 1) {
    this.tone(700 * pitch, 0.08, 'sine', 0.3, 180 * pitch);
  }

  boing(up = true) {
    this.tone(up ? 220 : 520, 0.25, 'sine', 0.3, up ? 520 : 200);
  }

  // ------------------------------------------------------------ event mapping

  consume(q) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    for (let i = 0; i < q.n; i++) {
      const e = q.items[i];
      switch (e.type) {
        case 'shoot': if (this.ok('sh', 0.11)) this.pop(1.3 + Math.random() * 0.15); break;
        case 'hit': if (this.ok('h', 0.06)) this.noise(0.04, 2000, 2, 0.08); break;
        case 'kill': if (this.ok('k', 0.05)) { this.pop(0.8 + Math.random() * 0.4); this.noise(0.1, 900, 1.5, 0.1); } break;
        case 'gate':
        case 'prize':
          if (e.b) [72, 76, 79, 84].forEach((m, k) => this.marimba(m, k * 0.05, 0.22));
          else { this.tone(220, 0.35, 'square', 0.1, 90); this.noise(0.2, 400, 1, 0.15); }
          break;
        case 'gate_bump': if (this.ok('gb', 0.07)) this.marimba(91, 0, 0.12); break;
        case 'clam_crack': if (this.ok('cc', 0.1)) { this.noise(0.15, 2500, 3, 0.25); this.strum(72, 0.05); } break;
        case 'bite': if (this.ok('bt', 0.08)) { this.boing(false); this.noise(0.15, 500, 2, 0.2); } break;
        case 'buddy_join':
        case 'buddy_up': this.strum(64); this.strum(71, 0.12); break;
        case 'buddy_fire': if (this.ok('bf', 0.12)) this.tone(500, 0.12, 'triangle', 0.07, 900); break;
        case 'splash': if (this.ok('sp', 0.12)) this.noise(0.18, 350, 1, 0.14); break;
        case 'boss_spawn': [0, 0.3, 0.6].forEach((w) => this.tone(110, 0.35, 'sine', 0.35, 55, w)); break;
        case 'boss_stage': this.tone(70, 0.9, 'sawtooth', 0.12, 50); break;
        case 'boss_throw': if (this.ok('bt2', 0.2)) this.tone(300, 0.3, 'triangle', 0.1, 600); break;
        case 'boss_windup': if (this.ok('bw', 0.3)) this.tone(90, 0.8, 'sawtooth', 0.1, 180); break;
        case 'boss_charge': this.noise(0.4, 300, 1, 0.3); break;
        case 'boss_summon': if (this.ok('bs', 0.3)) this.noise(0.3, 600, 2, 0.15); break;
        case 'strike_land': if (this.ok('sl', 0.1)) { this.noise(0.2, 300, 1, e.b ? 0.35 : 0.18); if (e.b) this.tone(160, 0.3, 'sine', 0.3, 70); } break;
        case 'dodge': this.marimba(88, 0, 0.15); break;
        case 'boss_defeat': [60, 64, 67, 72, 76, 79, 84].forEach((m, k) => this.marimba(m, k * 0.07, 0.25)); break;
        case 'win': [60, 64, 67, 72, 67, 72, 76, 79, 84].forEach((m, k) => this.marimba(m, k * 0.1, 0.26)); break;
        case 'lose': [67, 64, 60, 55].forEach((m, k) => this.marimba(m, k * 0.2, 0.25)); break;
        case 'level_start': this.strum(60); this.strum(67, 0.2); break;
        case 'buy': this.strum(72); break;
        case 'denied': if (this.ok('dn', 0.2)) { this.tone(160, 0.1, 'square', 0.08); this.tone(120, 0.12, 'square', 0.08, 0, 0.1); } break;
      }
    }
  }


  ui(kind) {
    if (!this.ctx || !this.settings.sfx) return;
    if (kind === 'move' && this.ok('ui_m', 0.03)) this.marimba(84, 0, 0.08);
    else if (kind === 'confirm' && this.ok('ui_c', 0.05)) this.pop(1.1);
    else if (kind === 'back' && this.ok('ui_b', 0.05)) this.pop(0.7);
  }

  // ------------------------------------------------------------ music

  setMusic(mode) {
    this.musicMode = mode;
  }

  // lookahead scheduler: tiny ukulele + marimba loop, calmer between waves
  schedule() {
    if (!this.ctx || this.ctx.state !== 'running' || !this.settings.music || !this.musicMode) return;
    const combat = this.musicMode === 'combat';
    const bpm = combat ? 116 : 88;
    const stepDur = 60 / bpm / 2;
    const now = this.ctx.currentTime;
    if (this.nextNote < now) this.nextNote = now + 0.05;
    while (this.nextNote < now + 0.2) {
      const when = this.nextNote - now;
      const st = this.step % 32;
      const chord = [60, 65, 67, 60][Math.floor(st / 8)];
      if (st % 4 === 2) this.strum(chord - 12, when, this.music);
      if (combat) {
        if (st % 2 === 0) this.marimba(chord - 12 + (st % 8 === 0 ? 0 : 7), when, 0.18, this.music);
        if ((st * 7) % 5 < 2) this.marimba(chord + PENTA[(st * 3) % PENTA.length], when, 0.12, this.music);
      } else if (st % 8 === 0) this.marimba(chord + PENTA[(st / 8) % 4 * 2], when, 0.12, this.music);
      this.nextNote += stepDur;
      this.step++;
    }
  }
}
