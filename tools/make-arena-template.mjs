// Writes docs/art/arena-template.svg (+ .png when Playwright is available): the exact
// geometry of the play field in the arena image's pixel space, for painting over.
//   node tools/make-arena-template.mjs
// Arena pixel space: X = x * 2, Y = (y + 70) * 0.82 * 2   (2 px per world unit, tilted camera)

import { writeFileSync, mkdirSync } from 'node:fs';
import { MAP, WORLD, FORMATION, BOSS_HOVER } from '../src/config.js';

const PPU = 2, TILT = 0.82, TOP = 70;
const W = WORLD.W * PPU, H = Math.round((WORLD.H + TOP) * TILT * PPU);
const X = (x) => +(x * PPU).toFixed(1);
const Y = (y) => +((y + TOP) * TILT * PPU).toFixed(1);

const grid = [];
for (let x = 0; x <= WORLD.W; x += 100) grid.push(`<line x1="${X(x)}" y1="0" x2="${X(x)}" y2="${H}"/><text x="${X(x) + 4}" y="${H - 8}">x${x}</text>`);
for (let y = 0; y <= WORLD.H; y += 100) grid.push(`<line x1="0" y1="${Y(y)}" x2="${W}" y2="${Y(y)}"/><text x="6" y="${Y(y) - 4}">y${y}</text>`);

const sockets = MAP.sockets.map(([x, y], i) =>
  `<ellipse cx="${X(x)}" cy="${Y(y)}" rx="${MAP.socketR * PPU}" ry="${MAP.socketR * PPU * TILT}" class="socket"/>` +
  `<text x="${X(x)}" y="${Y(y) + 7}" class="num">${i + 1}</text>`).join('\n  ');
const h = MAP.heart;
const railY = Y(WORLD.RAIL_Y + 22);
const shelf = 870;
// the formation's full reach: back row at rest to front row fully descended, plus sway
const fx0 = FORMATION.x - ((FORMATION.cols - 1) / 2) * FORMATION.dx - FORMATION.sway;
const fx1 = FORMATION.x + ((FORMATION.cols - 1) / 2) * FORMATION.dx + FORMATION.sway;
const fy0 = FORMATION.y - 30, fy1 = FORMATION.y + (FORMATION.rows - 1) * FORMATION.dy + FORMATION.descendMax + 30;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
  text { font: 700 22px system-ui, sans-serif; fill: #08323d; }
  .grid line { stroke: rgba(0,0,0,0.12); stroke-width: 1; }
  .grid text { font-size: 14px; fill: rgba(0,0,0,0.4); }
  .socket { fill: #ff8fa3; stroke: #cf5672; stroke-width: 6; }
  .num { text-anchor: middle; fill: #fff; font-size: 24px; }
  .label { font-size: 26px; text-anchor: middle; }
  .keep { fill: none; stroke: #c4002f; stroke-width: 4; stroke-dasharray: 14 10; }
  .zone { fill: rgba(255,255,255,0.12); stroke: #08323d; stroke-width: 3; stroke-dasharray: 10 10; }
</style>
<defs><linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c8fb0"/><stop offset="0.45" stop-color="#46dbd3"/><stop offset="1" stop-color="#1aa9c4"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#water)"/>
<rect x="0" y="${Y(shelf)}" width="${W}" height="${H - Y(shelf)}" fill="#f7e2a8"/>
<g class="grid">${grid.join('')}</g>
<rect x="${X(fx0)}" y="${Y(fy0)}" width="${X(fx1) - X(fx0)}" height="${Y(fy1) - Y(fy0)}" rx="20" class="zone"/>
<text x="${W / 2}" y="${Y(fy0) + 40}" class="label">ENEMY FORMATION flies here — keep it calm, open water (busy art hides enemies)</text>
<text x="${W / 2}" y="${Y(BOSS_HOVER.y) - 20}" class="label" style="font-size:20px">bosses hover around y ${BOSS_HOVER.y}</text>
<text x="${W / 2}" y="${Y(-22)}" class="label">▼ enemies swoop in from above the top edge ▼</text>
<text x="${W / 2}" y="${Y(780)}" class="label">open water: divers swoop through here toward the reef</text>
<line x1="0" y1="${Y(WORLD.REEF_Y)}" x2="${W}" y2="${Y(WORLD.REEF_Y)}" stroke="#c4002f" stroke-width="3" stroke-dasharray="8 8"/>
<text x="${W - 16}" y="${Y(WORLD.REEF_Y) - 10}" style="font-size:18px;text-anchor:end">reef edge (y ${WORLD.REEF_Y}): divers that reach it bite the Coral Heart</text>
<text x="${W / 2}" y="${Y(shelf) - 14}" class="label">SANDY REEF SHELF from y ${shelf} — coral cups, pebbles, clay coral between the sockets</text>
  ${sockets}
<ellipse cx="${X(h.x)}" cy="${Y(h.y)}" rx="${h.r * PPU * 1.1}" ry="${h.r * PPU * TILT * 1.1}" class="keep"/>
<text x="${X(h.x)}" y="${Y(h.y) - h.r * PPU * TILT - 12}" class="label" style="font-size:18px">CORAL HEART (separate sprite) — leave a sandy patch</text>
<rect x="${X(WORLD.RAIL_MIN - 30)}" y="${railY - 16}" width="${X(WORLD.RAIL_MAX + 30) - X(WORLD.RAIL_MIN - 30)}" height="28" rx="14" fill="#f0c987" stroke="#b98b4e" stroke-width="4"/>
<text x="${W / 2}" y="${railY - 26}" class="label">PLAYER RAIL — fish slides x ${WORLD.RAIL_MIN}–${WORLD.RAIL_MAX} along y ${WORLD.RAIL_Y}</text>
<text x="${W - 16}" y="32" style="font-size:22px;text-anchor:end">Reef Rumble arena template · ${W}×${H}px · 2 px/world unit · numbers = socket order</text>
</svg>
`;
mkdirSync('docs/art', { recursive: true });
writeFileSync('docs/art/arena-template.svg', svg);
console.log(`docs/art/arena-template.svg ${W}x${H}`);

try {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({ path: 'docs/art/arena-template.png' });
  await browser.close();
  console.log('docs/art/arena-template.png');
} catch (e) {
  console.log('(PNG skipped: Playwright not available)', e.message);
}
