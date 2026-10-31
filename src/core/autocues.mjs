// Draft cue sheet from picture measurements only (no agent looked). Used by the demo, whose
// mock clips flash white on their event frames, and as a starting point when no cue sheet
// exists: real footage needs an agent to look at the sheets and strips and pin every frame.
import fs from 'node:fs';
import path from 'node:path';
import { lumaProfile } from './video.mjs';

// Frames where mean luma jumps well above the running median: flashes, cuts to white.
export function flashFrames(luma, { jump = 60 } = {}) {
  const out = [];
  const sorted = [...luma].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  for (let i = 0; i < luma.length; i++) if (luma[i] - median > jump && (i === 0 || luma[i - 1] - median <= jump)) out.push(i);
  return out;
}

export async function draftCues(cfg, clips, file, log) {
  const L = ['<!-- draft: written by briefcut from luma flashes, not from looking at the sheets. -->', '# Cues (draft)', ''];
  for (const row of cfg.edl.filter((r) => r.kind === 'clip')) {
    const clip = clips[row.key];
    const luma = await lumaProfile(clip.file);
    const flashes = flashFrames(luma);
    // "step_1 .. step_n" takes every remaining flash.
    const names = [];
    for (const n of cfg.eventSpecs.filter((s) => s.key === row.key).flatMap((s) => s.names)) {
      if (!n.includes('..')) names.push(n);
      else {
        const prefix = n.split('..')[0].replace(/\d+$/, '');
        for (let k = 1; names.length < flashes.length; k++) names.push(`${prefix}${k}`);
      }
    }
    L.push(`## ${row.source}`, `in: 0.000`, `out: ${(clip.frames / cfg.fps).toFixed(3)}`, 'cut: none');
    names.forEach((n, k) => {
      const f = flashes[k];
      L.push(f == null ? `${n}: ${(clip.frames / cfg.fps / 2).toFixed(3)}   (not found)` : `${n}: ${(f / cfg.fps).toFixed(3)}   (frame ${f}, luma flash)`);
    });
    L.push('');
    if (flashes.length !== names.length) log?.assume('draft cues', `${row.source}: ${flashes.length} flash(es) for ${names.length} event name(s)`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, L.join('\n'));
  return file;
}
