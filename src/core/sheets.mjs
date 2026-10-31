// Contact sheets: the only way an agent looks at a whole clip. 2 fps, 180 px frames, time and
// frame number burned in, 8 per row, plus a motion profile (mean frame difference per frame)
// written next to it so quiet and busy stretches can be read without opening any frame.
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, hasFilter } from './ff.mjs';
import { findFont, filterPath, motionProfile } from './video.mjs';
import { ensureDir } from './util.mjs';

export async function contactSheet(file, out, { fps = 2, width = 180, cols = 8, srcFps = 24, frames }) {
  ensureDir(path.dirname(out));
  const font = findFont();
  const label = hasFilter('drawtext') ? `,drawtext=${font ? `fontfile=${filterPath(font)}:` : ''}text='%{pts\\:hms}  f%{eif\\:t*${srcFps}+0.5\\:d}':x=4:y=4:fontsize=${Math.max(11, Math.round(width / 11))}:fontcolor=black:box=1:boxcolor=white@0.85` : '';
  const count = Math.max(1, Math.ceil((frames / srcFps) * fps));
  const rows = Math.ceil(count / cols);
  await ffmpeg(['-y', '-v', 'error', '-i', file, '-an', '-vf', `fps=${fps}:round=down,scale=${width}:-2${label},tile=${cols}x${rows}:padding=3:color=white`, '-frames:v', '1', '-q:v', '4', out]);
  return { file: out, frames: count };
}

export async function writeMotion(file, out, fps = 24) {
  const m = await motionProfile(file);
  fs.writeFileSync(out, ['frame\tseconds\tmotion', ...m.map((v, i) => `${i}\t${(i / fps).toFixed(3)}\t${v.toFixed(2)}`)].join('\n') + '\n');
  return m;
}
