// Browser smoke test: boots the PWA in headless Chromium, starts a level from the
// title with real keyboard input, steers with a real drag, pauses, plays the level
// out, checks the result screen, the saved progress and the offline boot, and
// fails on any console error.
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
  await page.waitForFunction(() => window.reef && window.reef.game && window.reef.sprites.ready, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${label}-1-title.png` });

  const phase = () => page.evaluate(() => window.reef.game.phase);
  const press = async (key) => {
    await page.keyboard.press(key);
    await page.waitForTimeout(80);
  };

  // title -> Play (first item)
  await press('Enter');
  if ((await phase()) !== 'play') throw new Error(`${label}: expected play, got ${await phase()}`);
  await page.waitForTimeout(600);

  // steer with a real drag: the school follows the finger sideways
  const cx = viewport.width / 2, cy = viewport.height * 0.7;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let k = 1; k <= 6; k++) {
    await page.mouse.move(cx + k * 15, cy);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(300);
  const x1 = await page.evaluate(() => window.reef.game.school.x);
  await page.mouse.move(cx - 60, cy);
  await page.waitForTimeout(400);
  await page.mouse.up();
  const x2 = await page.evaluate(() => window.reef.game.school.x);
  console.log(label, 'drag steering', Math.round(x1), Math.round(x2));
  if (!(x1 > 30 && x2 < x1 - 30)) throw new Error(`${label}: drag did not steer (${x1}, ${x2})`);
  await page.screenshot({ path: `${out}/${label}-2-play.png` });

  // pause / resume
  await press('Escape');
  if (!(await page.evaluate(() => window.reef.game.paused))) throw new Error(`${label}: pause failed`);
  await page.screenshot({ path: `${out}/${label}-3-pause.png` });
  await press('Escape');
  if (await page.evaluate(() => window.reef.game.paused)) throw new Error(`${label}: resume failed`);

  // play the rest of the level headlessly (pick the better gate, aim at the nearest thing)
  const stats = await page.evaluate(() => {
    const g = window.reef.game;
    const worth = (e) => (e.type === 'add' ? g.school.n + e.value : e.type === 'mul' ? g.school.n * e.value : g.school.n + 5);
    for (let i = 0; i < 60 * 180 && g.phase === 'play'; i++) {
      let gate = null;
      for (const o of g.things) if (o.alive && o.kind === 'gate' && o.x < 0 && o.z > 0 && (!gate || o.z < gate.z)) gate = o;
      let goal = g.school.x;
      if (g.boss && g.stage === 1) goal = g.boss.x;
      else if (gate && gate.z < 600) goal = worth(gate.gate) >= worth(gate.partner.gate) ? -75 : 75;
      else {
        let b = null;
        for (const o of g.things) if (o.alive && o.kind !== 'gate' && o.kind !== 'boss' && o.z > 0 && (!b || o.z < b.z)) b = o;
        if (b) goal = b.x;
      }
      g.input.targetX = goal;
      g.update(1 / 60);
    }
    return { phase: g.phase, fish: g.school.n, level: g.meta.level, coins: g.meta.coins };
  });
  console.log(label, 'level played out', JSON.stringify(stats));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${label}-4-result.png` });
  if (stats.phase !== 'won' && stats.phase !== 'lost') throw new Error(`${label}: level did not end (${stats.phase})`);

  // the result screen's first button starts the next attempt
  await press('Enter');
  if ((await phase()) !== 'play') throw new Error(`${label}: expected play after the result screen`);

  // reload: progress is saved
  await page.reload();
  await page.waitForFunction(() => window.reef && window.reef.game);
  const meta = await page.evaluate(() => window.reef.game.meta);
  console.log(label, 'saved progress', JSON.stringify({ level: meta.level, coins: meta.coins }));
  if (meta.level !== stats.level || meta.coins !== stats.coins) throw new Error(`${label}: progress not saved`);

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
  await run({ width: 402, height: 874 }, 'phone', true);
} finally {
  await browser.close();
}
if (errors.length) {
  console.error('Console errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('smoke OK');
