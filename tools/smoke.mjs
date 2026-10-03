// Browser smoke test: boots the PWA in headless Chromium, plays through the
// menus with real keyboard input, runs a wave, and fails on any console error.
//   npx http-server . -p 8080 &   then   node tools/smoke.mjs [url] [outDir]

import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:8080/';
const out = process.argv[3] || '.';
const errors = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
async function run(viewport, label, touch) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${label}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => window.reef && window.reef.game);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${label}-1-title.png` });

  const phase = () => page.evaluate(() => window.reef.game.phase);
  const press = async (key, n = 1) => {
    for (let i = 0; i < n; i++) {
      await page.keyboard.press(key);
      await page.waitForTimeout(60);
    }
  };

  // title -> New Reef Run (first item when no save)
  await press('Enter');
  if ((await phase()) !== 'draft') throw new Error(`${label}: expected draft, got ${await phase()}`);
  await page.screenshot({ path: `${out}/${label}-2-draft.png` });
  await press('ArrowRight');
  await press('Enter');
  if ((await phase()) !== 'place') throw new Error(`${label}: expected place, got ${await phase()}`);
  await press('ArrowRight', 2);
  await page.screenshot({ path: `${out}/${label}-3-place.png` });
  await press('Enter');
  if ((await phase()) !== 'build') throw new Error(`${label}: expected build, got ${await phase()}`);
  // open the socket we just filled and look at its menu, then back out
  await press('Enter');
  await page.screenshot({ path: `${out}/${label}-4-socket.png` });
  await press('Escape');
  // jump to buttons (Up) -> Start Wave is focused -> confirm
  await press('ArrowUp');
  await page.screenshot({ path: `${out}/${label}-5-build.png` });
  await press('Enter');
  if ((await phase()) !== 'combat') throw new Error(`${label}: expected combat, got ${await phase()}`);

  // play: hold minus, nudge right then left, and keep firing until the first
  // jellies cross the fish's column on the top run
  await page.keyboard.down('ArrowDown');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowLeft');
  await page.waitForFunction(() => window.reef.game.waveStats.kills > 0, null, { timeout: 40000 }).catch(() => {});
  await page.keyboard.up('ArrowDown');
  await press('ArrowUp'); // a plus shot
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${label}-6-combat.png` });
  const stats = await page.evaluate(() => {
    const g = window.reef.game;
    return { phase: g.phase, enemies: g.enemies.length, kills: g.waveStats.kills, meter: Math.round(g.player.meter), x: Math.round(g.player.x), fps: document.getElementById('debug').textContent };
  });
  console.log(label, JSON.stringify(stats));
  if (stats.kills < 1) throw new Error(`${label}: no kills after shooting`);

  // pause menu
  await press('Escape');
  if (!(await page.evaluate(() => window.reef.game.paused))) throw new Error(`${label}: pause failed`);
  await page.screenshot({ path: `${out}/${label}-7-pause.png` });
  await press('Escape');
  if (await page.evaluate(() => window.reef.game.paused)) throw new Error(`${label}: resume failed`);

  // fast-forward the rest of the wave headlessly and check the wave-end flow
  await page.evaluate(() => {
    const g = window.reef.game;
    for (let i = 0; i < 60 * 240 && g.phase === 'combat'; i++) {
      g.input.minus = true;
      g.input.moveX = g.enemies[0] ? g.enemies[0].x : 400;
      g.update(1 / 60);
    }
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${label}-8-waveend.png` });
  const ph = await phase();
  if (ph !== 'waveEnd' && ph !== 'defeat') throw new Error(`${label}: expected waveEnd, got ${ph}`);
  await press('Enter');
  await page.screenshot({ path: `${out}/${label}-9-fork.png` });
  if ((await phase()) !== 'fork') throw new Error(`${label}: expected fork, got ${await phase()}`);
  await press('ArrowRight');
  await press('Enter');
  if ((await phase()) !== 'draft') throw new Error(`${label}: expected draft after fork`);

  // reload: save should offer Continue and restore the draft screen
  await page.reload();
  await page.waitForFunction(() => window.reef && window.reef.game);
  await page.waitForTimeout(300);
  await press('Enter');
  const resumed = await page.evaluate(() => ({ phase: window.reef.game.phase, wave: window.reef.game.wave, towers: window.reef.game.towers.length }));
  console.log(label, 'resumed', JSON.stringify(resumed));
  if (resumed.phase !== 'draft' || resumed.wave !== 2 || resumed.towers !== 1) throw new Error(`${label}: resume failed`);
  const sw = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));
  console.log(label, 'service worker registered:', sw);

  // offline: once the service worker is active, the whole game (art included) must boot with no network
  await page.evaluate(() => navigator.serviceWorker.ready);
  const delivered = await page.evaluate(async () => {
    const m = await (await fetch('assets/art/manifest.json')).json();
    return Object.values(m.sprites).filter((d) => d.file).length;
  });
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.reef && window.reef.sprites.ready, null, { timeout: 15000 });
  const off = await page.evaluate(() => ({ phase: window.reef.game.phase, sprites: window.reef.sprites.loaded, failed: window.reef.sprites.failed.length }));
  console.log(label, 'offline boot', JSON.stringify(off), 'expected sprites', delivered);
  if (off.phase !== 'title' || off.sprites !== delivered || off.failed) throw new Error(`${label}: offline boot incomplete`);
  await ctx.setOffline(false);
  await ctx.close();
}

try {
  await run({ width: 1280, height: 800 }, 'desktop', false);
  await run({ width: 390, height: 844 }, 'phone', true);
} finally {
  await browser.close();
}
if (errors.length) {
  console.error('Console errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('smoke OK');
