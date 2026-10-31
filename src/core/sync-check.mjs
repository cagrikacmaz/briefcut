// sync_check.jpg, cut from the rendered master: for every placed cue in time order, the frame
// under the start of its sound plus 1/8 s before and after, labelled with the cue, the event and
// the moment the frame must show. Looking at this image is how an agent verifies sync.
import path from 'node:path';
import { extractFrames, labelImage, tile } from './video.mjs';
import { ensureDir } from './util.mjs';

export async function syncCheck(master, cues, cfg, out, workDir, { perRow = 2 } = {}) {
  const fps = cfg.fps;
  const d = Math.max(1, Math.round(fps / 8));
  const list = cues.filter((c) => c.status === 'placed').sort((a, b) => a.timeline - b.timeline || String(a.id).localeCompare(String(b.id)));
  const frames = [];
  for (const c of list) {
    const f = Math.round(c.syncTime * fps);
    frames.push(Math.max(0, f - d), f, f + d);
  }
  const dir = ensureDir(path.join(workDir, 'sync'));
  const imgs = await extractFrames(master, frames, dir, { width: cfg.sync.checkWidth });
  const labelled = [];
  for (const [i, c] of list.entries()) {
    const f = Math.round(c.syncTime * fps);
    for (let k = 0; k < 3; k++) {
      const o = path.join(dir, `s_${String(i * 3 + k).padStart(4, '0')}.png`);
      const head = k === 1 ? `#${c.id} ${c.kind === 'sfx' ? c.sfxName : c.voice}\n${c.event || '-'} f${f} ${c.syncTime.toFixed(3)}s\n${(c.rule || '').slice(0, 30)}` : `${k === 0 ? '-' : '+'}1/8 s\nf${frames[i * 3 + k]}`;
      await labelImage(imgs[i * 3 + k], o, head, dir, { size: 12 });
      labelled.push(o);
    }
  }
  if (labelled.length) await tile(labelled, 3 * perRow, out, workDir);
  return list.length;
}
