// Builds the deployable site into _site/ (only what the game needs at runtime).
//   node tools/build-site.mjs [buildId]
// The service worker's cache name is stamped with the build id (default: git
// short SHA), so every publish invalidates the offline cache and installed
// iPhones pick up the new version on their next launch.

import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const OUT = '_site';
const FILES = ['index.html', 'manifest.webmanifest', 'sw.js', 'art-preview.html'];
const DIRS = ['css', 'src', 'icons', 'assets'];

let id = process.argv[2];
if (!id) {
  try {
    id = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    id = Date.now().toString(36);
  }
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const f of FILES) cpSync(f, `${OUT}/${f}`);
for (const d of DIRS) if (existsSync(d)) cpSync(d, `${OUT}/${d}`, { recursive: true });
writeFileSync(`${OUT}/.nojekyll`, ''); // serve files as-is (no Jekyll processing)

const sw = readFileSync(`${OUT}/sw.js`, 'utf8');
const stamped = sw.replace(/const CACHE = '([^']+)';/, (_, name) => `const CACHE = '${name}+${id}';`);
if (stamped === sw) throw new Error('could not stamp CACHE in sw.js');
writeFileSync(`${OUT}/sw.js`, stamped);

console.log(`built ${OUT}/ (cache ${stamped.match(/const CACHE = '([^']+)'/)[1]})`);
