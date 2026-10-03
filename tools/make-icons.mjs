// Generates the PWA icons (placeholder clay fish) as PNGs with no dependencies.
//   node tools/make-icons.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Paints in unit coordinates (0..1), 3x3 supersampled.
function draw(size, pad) {
  const buf = Buffer.alloc(size * size * 4);
  const bgTop = hex('#46dbd3'), bgBot = hex('#1aa9c4');
  const body = hex('#ff8a1f'), fin = hex('#e0620a'), white = [255, 255, 255], pupil = hex('#1b1030');
  const minus = hex('#9b5cff'), plus = hex('#ffd23f'), sand = hex('#f7e2a8');
  const S = 3;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        let u = (px + (sx + 0.5) / S) / size, v = (py + (sy + 0.5) / S) / size;
        u = (u - pad) / (1 - 2 * pad);
        v = (v - pad) / (1 - 2 * pad);
        const t = Math.min(1, Math.max(0, (py + sy / S) / size));
        let c = [bgTop[0] + (bgBot[0] - bgTop[0]) * t, bgTop[1] + (bgBot[1] - bgTop[1]) * t, bgTop[2] + (bgBot[2] - bgTop[2]) * t];
        if (v > 0.86 + Math.sin(u * 12) * 0.015) c = sand;
        const inE = (cx, cy, rx, ry) => ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2 <= 1;
        // bubbles
        if (inE(0.2, 0.22, 0.09, 0.09)) c = minus;
        if (inE(0.2, 0.22, 0.05, 0.016)) c = white;
        if (inE(0.8, 0.2, 0.1, 0.1)) c = plus;
        if (inE(0.8, 0.2, 0.06, 0.018) || inE(0.8, 0.2, 0.018, 0.06)) c = white;
        // tail
        const tx = u - 0.2, ty = v - 0.56;
        if (tx > -0.12 && tx < 0.08 && Math.abs(ty) < (0.08 - tx) * 0.9 && tx < 0.08) c = fin;
        // body
        if (inE(0.52, 0.56, 0.3, 0.22)) {
          c = body;
          if (Math.abs(u - 0.5) < 0.04 || Math.abs(u - 0.66) < 0.03) c = white;
          if (inE(0.42, 0.47, 0.09, 0.05)) c = [255, 190, 130];
        }
        if (inE(0.72, 0.5, 0.075, 0.075)) c = white;
        if (inE(0.74, 0.5, 0.038, 0.038)) c = pupil;
        r += c[0];
        g += c[1];
        b += c[2];
      }
      const i = (py * size + px) * 4;
      buf[i] = r / (S * S);
      buf[i + 1] = g / (S * S);
      buf[i + 2] = b / (S * S);
      buf[i + 3] = 255;
    }
  }
  return png(size, buf);
}

mkdirSync('icons', { recursive: true });
writeFileSync('icons/icon-192.png', draw(192, 0.04));
writeFileSync('icons/icon-512.png', draw(512, 0.04));
writeFileSync('icons/icon-maskable-512.png', draw(512, 0.14));
writeFileSync('icons/apple-touch-icon.png', draw(180, 0.06));
console.log('icons written');
