// Headless balance simulation: plays levels in a row with the autopilot,
// buying upgrades with coins between levels like a player would.
//   node tools/sim.mjs [runs=4] [skill=good|sloppy|idle] [levels=12]

import { Game, PHASE } from '../src/core/game.js';
import { SIM, UPGRADES } from '../src/config.js';
import { botInput, botReset } from './bot.mjs';

function spend(g) {
  for (let guard = 0; guard < 50; guard++) {
    let cheapest = null, cc = Infinity;
    for (const id in UPGRADES) {
      const c = g.upgradeCost(id);
      if (c != null && c < cc) {
        cc = c;
        cheapest = id;
      }
    }
    if (!cheapest || g.meta.coins < cc) return;
    g.buyUpgrade(cheapest);
  }
}

// Plays until `levels` are cleared or `maxTries` attempts are used up.
export function playCampaign(skill = 'good', levels = 12, maxTries = 40, onLevel = null, seed = 1) {
  botReset(seed);
  const g = new Game();
  const out = [];
  let tries = 0, ticks = 0, simMs = 0, maxThings = 0, maxBullets = 0;
  while (g.meta.level <= levels && tries < maxTries) {
    tries++;
    g.startLevel();
    let t = 0;
    while (g.phase === PHASE.PLAY) {
      botInput(g, skill);
      const t0 = performance.now();
      g.update(SIM.DT);
      simMs += performance.now() - t0;
      g.events.clear();
      ticks++;
      t += SIM.DT;
      if (g.things.length > maxThings) maxThings = g.things.length;
      if (g.bullets.length > maxBullets) maxBullets = g.bullets.length;
      if (t > 600) throw new Error(`level ${g.level} stuck`);
    }
    const r = { level: g.result.level, won: g.result.won, secs: +t.toFixed(1), fish: g.result.fish, coins: g.result.coins };
    out.push(r);
    if (onLevel) onLevel(r, g);
    spend(g);
  }
  return { skill, reached: g.meta.level, tries, levels: out, usPerTick: ticks ? (simMs * 1000) / ticks : 0, maxThings, maxBullets, up: { ...g.meta.up } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runs = +(process.argv[2] || 4);
  const skill = process.argv[3] || 'good';
  const levels = +(process.argv[4] || 12);
  for (let i = 0; i < runs; i++) {
    const r = playCampaign(skill, levels, 40, null, i + 1);
    const fails = r.levels.filter((l) => !l.won).length;
    console.log(`${skill}: reached level ${r.reached} in ${r.tries} tries (${fails} fails)  ${r.usPerTick.toFixed(0)}µs/tick  maxThings ${r.maxThings} maxBullets ${r.maxBullets}  up ${JSON.stringify(r.up)}`);
    console.log('   ' + r.levels.map((l) => `L${l.level}${l.won ? '✓' : '✗'}${l.secs}s/${l.fish}f`).join(' '));
  }
}
