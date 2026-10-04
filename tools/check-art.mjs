// Validates assets/art/manifest.json against the delivered sprite sheets.
//   node tools/check-art.mjs
// Checks: files exist, sheet dimensions fit every declared animation row,
// anchors are in range, and decoded texture memory stays inside the iPhone budget.
// Also prints delivery progress per priority (P0 must ship before P1/P2).

import { readFileSync, existsSync } from 'node:fs';

const BASE = 'assets/art/';
const BUDGET_MB = 96; // decoded RGBA across all sheets (safe on iPhone 17 with headroom)
const m = JSON.parse(readFileSync(BASE + 'manifest.json', 'utf8'));
const errors = [];
const warnings = [];
const sizes = new Map();

function imageSize(file) {
  if (sizes.has(file)) return sizes.get(file);
  const b = readFileSync(BASE + file);
  if (b.length < 30) {
    errors.push(`${file}: truncated or empty image`);
    sizes.set(file, null);
    return null;
  }
  let out = null;
  if (b.readUInt32BE(0) === 0x89504e47) out = { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  else if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') out = { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    else if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      out = { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) };
    } else if (chunk === 'VP8 ') out = { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  if (!out) errors.push(`${file}: unsupported image format (use PNG or WebP)`);
  sizes.set(file, out);
  return out;
}

const progress = {};
let decoded = 0;
const counted = new Set();
for (const [key, d] of Object.entries(m.sprites)) {
  // A complete glossy release must never silently fall back to legacy artwork.
  if (m.version >= 17) {
    if (d.style !== 'gloss-v1') errors.push(`${key}: missing glossy style contract`);
    if (!d.file) errors.push(`${key}: missing production artwork`);
    for (const f of [d.file, ...Object.values(d.anims || {}).map((a) => a.file)].filter(Boolean)) {
      if (!f.startsWith('gloss/')) errors.push(`${key}: legacy artwork reference ${f}`);
    }
  }
  const p = d.priority || 'P?';
  progress[p] = progress[p] || { done: 0, total: 0, missing: [] };
  progress[p].total++;
  const files = new Set();
  if (d.file) files.add(d.file);
  for (const a of Object.values(d.anims || {})) if (a.file) files.add(a.file);
  if (!files.size) {
    progress[p].missing.push(key);
    continue;
  }
  let ok = true;
  for (const f of files) {
    if (!existsSync(BASE + f)) {
      errors.push(`${key}: file not found: ${BASE}${f}`);
      ok = false;
    }
  }
  if (!ok) continue;
  if (!Array.isArray(d.frame) || d.frame.length !== 2) errors.push(`${key}: "frame" must be [width, height]`);
  if (d.anchor && (d.anchor[0] < 0 || d.anchor[0] > 1 || d.anchor[1] < 0 || d.anchor[1] > 1)) errors.push(`${key}: anchor must be fractions 0..1`);
  for (const [name, a] of Object.entries(d.anims || {})) {
    const f = a.file || d.file;
    if (!f) {
      errors.push(`${key}.${name}: no file`);
      continue;
    }
    const sz = imageSize(f);
    if (!sz) continue;
    const needW = ((a.col | 0) + (a.frames | 0)) * d.frame[0];
    const needH = ((a.row | 0) + 1) * d.frame[1];
    if (sz.w < needW || sz.h < needH) errors.push(`${key}.${name}: needs ${needW}x${needH}px of sheet, ${f} is ${sz.w}x${sz.h}`);
    if (!counted.has(f)) {
      counted.add(f);
      decoded += sz.w * sz.h * 4;
      if (sz.w > 4096 || sz.h > 4096) warnings.push(`${f}: ${sz.w}x${sz.h} exceeds 4096px — split it (iOS texture limits)`);
    }
  }
  progress[p].done++;
}

const mb = decoded / 1048576;
if (mb > BUDGET_MB) errors.push(`decoded texture memory ${mb.toFixed(1)} MB exceeds the ${BUDGET_MB} MB iPhone budget`);

console.log(`Art manifest v${m.version} — ${counted.size} sheet(s), ~${mb.toFixed(1)} MB decoded (budget ${BUDGET_MB} MB)\n`);
for (const p of Object.keys(progress).sort()) {
  const r = progress[p];
  console.log(`${p}: ${r.done}/${r.total} delivered${r.missing.length ? `\n   missing: ${r.missing.join(', ')}` : ''}`);
}
for (const w of warnings) console.log('warning: ' + w);
if (errors.length) {
  console.log('\nERRORS:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log('\nmanifest OK');
