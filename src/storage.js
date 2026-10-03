// localStorage persistence. Every access is guarded: private browsing or
// blocked storage just means nothing is remembered.

const KEYS = {
  meta: 'reefrumble.meta.v3',
  oldMeta: 'reefrumble.meta.v1', // the tower-defense / wave-shooter builds (skins carry over)
  oldRun: 'reefrumble.run.v1',
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
  showFps: false,
  haptics: true,
};

export const storage = {
  // Raw saved progress (Game normalizes it).
  loadMeta() {
    const m = read(KEYS.meta);
    if (m) return m;
    const old = read(KEYS.oldMeta);
    remove(KEYS.oldRun);
    return old && Array.isArray(old.skins) ? { skins: old.skins, skin: old.skin } : null;
  },
  saveMeta(m) {
    write(KEYS.meta, m);
  },
  loadSettings() {
    return { ...DEFAULT_SETTINGS, ...(read(KEYS.settings) || {}) };
  },
  saveSettings(s) {
    write(KEYS.settings, s);
  },
};
