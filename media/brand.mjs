// Copies the brand files into media/ and cuts the mark out of the wordmark:
//   node media/brand.mjs <brandDir>
// <brandDir> holds logo-wordmark.png (mark above the word, on near-black), banner.png and
// social-preview.png. Writes media/logo-wordmark.png, banner.png, social-preview.png (metadata
// chunks dropped, pixels unchanged), logo-mark.png (the mark alone, transparent, square),
// icon-256.png and icon-64.png.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffmpeg } from '../src/core/ff.mjs';

const MEDIA = path.dirname(fileURLToPath(import.meta.url));
const brand = path.resolve(process.argv[2] || '.');

// Keep only the chunks needed to draw the image; text, EXIF and provenance chunks go.
const KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'pHYs']);
function stripPng(src, dst) {
  const b = fs.readFileSync(src);
  const parts = [b.subarray(0, 8)];
  const dropped = [];
  for (let i = 8; i < b.length;) {
    const len = b.readUInt32BE(i);
    const type = b.toString('ascii', i + 4, i + 8);
    if (KEEP.has(type)) parts.push(b.subarray(i, i + 12 + len));
    else dropped.push(type);
    i += 12 + len;
  }
  fs.writeFileSync(dst, Buffer.concat(parts));
  console.log(`${path.basename(dst)}${dropped.length ? `: dropped ${dropped.join(', ')}` : ''}`);
}

for (const f of ['logo-wordmark.png', 'banner.png', 'social-preview.png']) stripPng(path.join(brand, f), path.join(MEDIA, f));

async function size(file) {
  const { stderr } = await ffmpeg(['-i', file, '-f', 'null', '-']).catch((e) => ({ stderr: e.message }));
  const m = stderr.match(/, (\d{2,5})x(\d{2,5})/);
  return [Number(m[1]), Number(m[2])];
}

const src = path.join(MEDIA, 'logo-wordmark.png');
const [W, H] = await size(src);
const { stdout: rgb } = await ffmpeg(['-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
const px = (x, y) => [rgb[(y * W + x) * 3], rgb[(y * W + x) * 3 + 1], rgb[(y * W + x) * 3 + 2]];
const median = (rows) => [0, 1, 2].map((c) => rows.map((p) => p[c]).sort((a, b) => a - b)[rows.length >> 1]);

// Background from the corners, brass from the brightest pixels of the top half.
const corners = [];
for (const [x0, y0] of [[0, 0], [W - 40, 0], [0, H - 40], [W - 40, H - 40]])
  for (let y = y0; y < y0 + 40; y++) for (let x = x0; x < x0 + 40; x++) corners.push(px(x, y));
const bg = median(corners);
const bright = [];
for (let y = 0; y < H >> 1; y += 2) for (let x = 0; x < W; x += 2) { const p = px(x, y); if (p[0] + p[1] + p[2] > 400) bright.push(p); }
const ink = median(bright);
const d = ink.map((v, c) => v - bg[c]);
const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];

// Coverage of each pixel: its position on the line from background to brass.
const alpha = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = px(x, y);
  let a = ((p[0] - bg[0]) * d[0] + (p[1] - bg[1]) * d[1] + (p[2] - bg[2]) * d[2]) / dd;
  a = a < 0.06 ? 0 : a > 0.94 ? 1 : (a - 0.06) / 0.88;
  alpha[y * W + x] = a;
}

// The mark is the first band of rows with ink; the word starts after the first empty rows below it.
const rowInk = (y) => { let n = 0; for (let x = 0; x < W; x++) if (alpha[y * W + x] > 0.5) n++; return n; };
let top = 0;
while (rowInk(top) < 3) top++;
let bottom = top;
while (rowInk(bottom + 1) >= 3) bottom++;
let left = W, right = 0;
for (let y = top; y <= bottom; y++) for (let x = 0; x < W; x++) if (alpha[y * W + x] > 0.5) { left = Math.min(left, x); right = Math.max(right, x); }
console.log(`mark: x ${left}-${right}, y ${top}-${bottom}; background rgb(${bg}), brass rgb(${ink})`);

// Square canvas, mark centred, 6% margin; every pixel is brass, coverage goes to alpha.
const side = Math.round(Math.max(right - left + 1, bottom - top + 1) * 1.12);
const ox = left - Math.floor((side - (right - left + 1)) / 2);
const oy = top - Math.floor((side - (bottom - top + 1)) / 2);
const out = Buffer.alloc(side * side * 4);
for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
  const sx = x + ox, sy = y + oy;
  const inMark = sx >= left - 2 && sx <= right + 2 && sy >= top - 2 && sy <= bottom + 2;
  const a = inMark ? alpha[sy * W + sx] : 0;
  const o = (y * side + x) * 4;
  out[o] = ink[0]; out[o + 1] = ink[1]; out[o + 2] = ink[2]; out[o + 3] = Math.round(a * 255);
}
const mark = path.join(MEDIA, 'logo-mark.png');
const raw = ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${side}x${side}`, '-i', '-'];
await ffmpeg([...raw, '-pix_fmt', 'rgba', mark], { input: out });
console.log(`logo-mark.png ${side}x${side}`);
for (const s of [256, 64]) {
  await ffmpeg(['-v', 'error', '-y', '-i', mark, '-vf', `scale=${s}:${s}:flags=area`, '-pix_fmt', 'rgba', path.join(MEDIA, `icon-${s}.png`)]);
  console.log(`icon-${s}.png`);
}
