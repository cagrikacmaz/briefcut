// Event strips: frames around one moment of a clip, to pin an event to its exact frame after the
// 2 fps sheet gave an estimate. 8 fps covers ±0.75 s (every third frame at 24 fps); 24 fps shows
// nine consecutive frames to settle a doubtful frame.
import fs from 'node:fs';
import path from 'node:path';
import { extractFrames, labelImage, tile } from './video.mjs';
import { ensureDir } from './util.mjs';

export function stripFrames(t, { clipFps = 24, stripFps = 8, window = 0.75, frames = Infinity } = {}) {
  const c = Math.round(t * clipFps);
  const step = Math.max(1, Math.round(clipFps / stripFps));
  const half = stripFps >= clipFps ? 4 : Math.round((window * clipFps) / step);
  const out = [];
  for (let k = -half; k <= half; k++) {
    const f = c + k * step;
    if (f >= 0 && f < frames) out.push(f);
  }
  return out;
}

export async function makeStrip(clipFile, t, out, { clipFps = 24, stripFps = 8, window = 0.75, width = 240, frames = Infinity, label = '', workDir }) {
  const list = stripFrames(t, { clipFps, stripFps, window, frames });
  const dir = ensureDir(path.join(workDir, `strip_${path.basename(out, '.jpg')}`));
  const imgs = await extractFrames(clipFile, list, dir, { width });
  const labelled = [];
  for (const [i, f] of list.entries()) {
    const o = path.join(dir, `l_${i}.png`);
    await labelImage(imgs[i], o, `f${f}  ${(f / clipFps).toFixed(3)} s${i === 0 && label ? `\n${label}` : ''}`, dir, { size: 13 });
    labelled.push(o);
  }
  await tile(labelled, Math.min(list.length, stripFps >= clipFps ? 9 : 7), out, workDir);
  fs.rmSync(dir, { recursive: true, force: true });
  return { file: out, frames: list };
}
