// localStorage persistence. Every access is guarded: private browsing or
// blocked storage just means nothing is remembered.

const KEYS = {
  meta: 'reefrumble.meta.v1',
  run: 'reefrumble.run.v1',
  settings: 'reefrumble.settings.v1',
};

function read(key) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function write(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* storage full or blocked */
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const DEFAULT_SETTINGS = {
  music: true,
  sfx: true,
  volume: 0.75,
  shake: true,
  stopMotion: true,
  tiltShift: false,
  touch: 'auto',
  showFps: false,
};

export const storage = {
  loadMeta() {
    const m = read(KEYS.meta);
    const base = { endlessUnlocked: false, skins: ['classic'], skin: 'classic', bestWave: 0, bestEndless: 0, wins: 0, runs: 0 };
    if (!m) return base;
    const out = { ...base, ...m };
    if (!Array.isArray(out.skins) || !out.skins.includes('classic')) out.skins = ['classic', ...(Array.isArray(out.skins) ? out.skins : [])];
    return out;
  },
  saveMeta(m) {
    write(KEYS.meta, m);
  },
  loadRun() {
    return read(KEYS.run);
  },
  saveRun(r) {
    write(KEYS.run, r);
  },
  clearRun() {
    remove(KEYS.run);
  },
  loadSettings() {
    return { ...DEFAULT_SETTINGS, ...(read(KEYS.settings) || {}) };
  },
  saveSettings(s) {
    write(KEYS.settings, s);
  },
};
