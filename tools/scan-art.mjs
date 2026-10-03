// Finds animation frames whose art ends in a long, perfectly straight alpha edge:
// the signature of a pose that was cropped when packed into its cell (clay
// outlines are never straight). Needs ImageMagick (`convert`, `identify`).
//   node tools/scan-art.mjs [minRunPx=16]
// Prints a report; review flagged frames in art-preview.html.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const m = JSON.parse(readFileSync('assets/art/manifest.json', 'utf8'));
const MIN_RUN = +(process.argv[2] || 16);
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const [w, h] = execSync(`identify -format "%w %h" assets/art/${file}`).toString().split(' ').map(Number);
  const raw = execSync(`convert assets/art/${file} -depth 8 rgba:-`, { maxBuffer: 1 << 30 });
  const img = { w, h, a: (x, y) => raw[(y * w + x) * 4 + 3] };
  cache.set(file, img);
  return img;
}
const report = [];
for (const [key, d] of Object.entries(m.sprites)) {
  if (!d.file || key === 'board') continue;
  const [fw, fh] = d.frame;
  for (const [name, an] of Object.entries(d.anims)) {
    const img = load(an.file || d.file);
    for (let f = 0; f < an.frames; f++) {
      const x0 = ((an.col | 0) + f) * fw, y0 = (an.row | 0) * fh;
      let worst = { run: 0 };
      // vertical cuts: solid at x, empty at x+1 (right cut) or the mirror (left cut)
      for (let x = x0 + 1; x < x0 + fw - 2; x++) {
        let runR = 0, runL = 0;
        for (let y = y0; y < y0 + fh; y++) {
          const a0 = img.a(x, y), a1 = img.a(x + 1, y);
          runR = a0 > 200 && a1 < 16 ? runR + 1 : 0;
          runL = a0 < 16 && a1 > 200 ? runL + 1 : 0;
          if (runR > worst.run) worst = { run: runR, side: 'right', at: x - x0 };
          if (runL > worst.run) worst = { run: runL, side: 'left', at: x - x0 };
        }
      }
      for (let y = y0 + 1; y < y0 + fh - 2; y++) {
        let runB = 0, runT = 0;
        for (let x = x0; x < x0 + fw; x++) {
          const a0 = img.a(x, y), a1 = img.a(x, y + 1);
          runB = a0 > 200 && a1 < 16 ? runB + 1 : 0;
          runT = a0 < 16 && a1 > 200 ? runT + 1 : 0;
          if (runB > worst.run) worst = { run: runB, side: 'bottom', at: y - y0 };
          if (runT > worst.run) worst = { run: runT, side: 'top', at: y - y0 };
        }
      }
      if (worst.run >= MIN_RUN) report.push(`${key.padEnd(20)} ${name}#${f}  ${worst.side} cut ${worst.run}px at ${worst.at}/${worst.side === 'left' || worst.side === 'right' ? fw : fh}`);
    }
  }
}
console.log(report.length ? report.join('\n') : 'no straight-edge cuts found');
