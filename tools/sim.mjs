// Headless balance simulation: plays full runs with the autopilot bot.
//   node tools/sim.mjs [runs=6] [skill=good|basic|sloppy|idle] [maxWave=20]

import { Game, PHASE } from '../src/core/game.js';
import { SIM } from '../src/config.js';
import { RNG } from '../src/core/util.js';
import { botDecide, botInput } from './bot.mjs';

export function playRun(seed, skill = 'good', maxWave = 20, onWave = null) {
  const g = new Game({ seed });
  g.newRun({ seed });
  const rng = new RNG(seed * 7 + 3);
  const waves = [];
  let ticks = 0, simMs = 0, maxEnemies = 0, maxProj = 0, waveTicks = 0;
  for (let guard = 0; guard < 2e6; guard++) {
    if (g.phase === PHASE.COMBAT) {
      botInput(g, skill);
      const t0 = performance.now();
      g.update(SIM.DT);
      simMs += performance.now() - t0;
      g.events.clear();
      ticks++;
      waveTicks++;
      if (g.enemies.length > maxEnemies) maxEnemies = g.enemies.length;
      if (g.projectiles.length > maxProj) maxProj = g.projectiles.length;
      if (g.phase !== PHASE.COMBAT) {
        const ws = g.waveSummary;
        const rec = { wave: ws.wave, secs: +(waveTicks * SIM.DT).toFixed(1), heart: Math.round(g.heart.hp), dmg: Math.round(ws.heartDmg), kills: ws.kills, shells: g.shells, towers: g.towers.length, eaten: ws.towersEaten, hits: ws.playerHits, score: g.score };
        waves.push(rec);
        if (onWave) onWave(rec, g);
        waveTicks = 0;
      }
      if (waveTicks > 60 * 600) throw new Error(`wave ${g.wave} stuck (seed ${seed})`);
      continue;
    }
    if (g.phase === PHASE.WAVE_END && g.wave >= maxWave) break;
    if (!botDecide(g, rng, skill)) break;
  }
  return {
    seed, skill, outcome: g.phase === PHASE.DEFEAT ? 'defeat' : g.phase === PHASE.VICTORY ? 'victory' : 'stopped',
    wave: g.wave, score: g.score, waves, usPerTick: ticks ? (simMs * 1000) / ticks : 0, maxEnemies, maxProj,
    towers: g.towers.map((t) => `${t.type}${t.level + 1}`).join(' '),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runs = +(process.argv[2] || 6);
  const skill = process.argv[3] || 'good';
  const maxWave = +(process.argv[4] || 20);
  const results = [];
  for (let i = 0; i < runs; i++) {
    const r = playRun(1000 + i * 17, skill, maxWave);
    results.push(r);
    console.log(`seed ${r.seed} ${r.outcome.padEnd(8)} wave ${String(r.wave).padStart(2)}  score ${r.score}  ${r.usPerTick.toFixed(0)}µs/tick  maxE ${r.maxEnemies} maxP ${r.maxProj}  [${r.towers}]`);
    console.log('   ' + r.waves.map((w) => `w${w.wave}:${w.secs}s/h${w.heart}${w.hits ? '/x' + w.hits : ''}${w.eaten ? '/eat' + w.eaten : ''}`).join(' '));
  }
  const wins = results.filter((r) => r.outcome === 'victory').length;
  const avgWave = results.reduce((a, r) => a + r.wave, 0) / results.length;
  console.log(`\n${skill}: ${wins}/${runs} wins, avg wave reached ${avgWave.toFixed(1)}`);
}
