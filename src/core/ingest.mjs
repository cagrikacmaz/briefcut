// `briefcut ingest`: copies downloaded takes into clips/_takes, probes every one and writes
// clips/_takes/INGEST.md (size, frame rate, frames, colour tags, hash). Duplicates by content
// are set aside. Nothing is upscaled, retimed or re-encoded here; a take that is not at the
// film's size or rate is reported, and the cut conforms it (logged) only if it is used.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { probe } from './ff.mjs';
import { ensureDir, globToRegExp, parseDuration } from './util.mjs';
import { FOOTAGE, STILL } from './video.mjs';

// Without a match glob every video file and still is taken (a camera card, a download folder).
export async function ingest({ filmDir, from, since = null, match = null, cfg, log, now = Date.now() }) {
  const src = path.resolve(from.replace(/^~(?=$|[\\/])/, process.env.HOME || process.env.USERPROFILE || '~'));
  if (!fs.existsSync(src)) throw new Error(`ingest: ${src} does not exist`);
  const dest = ensureDir(path.join(filmDir, 'clips', '_takes'));
  const re = match ? globToRegExp(match) : FOOTAGE;
  const cutoff = since ? now - parseDuration(since) : 0;
  const known = new Map();
  for (const f of fs.readdirSync(dest).filter((n) => FOOTAGE.test(n))) known.set(md5(path.join(dest, f)), f);
  const rows = [];
  for (const name of fs.readdirSync(src).sort()) {
    const p = path.join(src, name);
    const st = fs.statSync(p);
    if (!st.isFile() || !re.test(name) || st.mtimeMs < cutoff) continue;
    const hash = md5(p);
    if (known.has(hash)) {
      rows.push({ name, skipped: `same content as ${known.get(hash)}` });
      continue;
    }
    let out = name.replace(/\s*\((\d+)\)(?=\.\w+$)/, '_$1').replace(/\s+/g, '_');
    while (fs.existsSync(path.join(dest, out))) out = out.replace(/(\.\w+)$/, '_b$1');
    fs.copyFileSync(p, path.join(dest, out));
    known.set(hash, out);
    const info = await probe(path.join(dest, out));
    const v = info.streams.find((s) => s.codec_type === 'video');
    const [n, d] = (v?.r_frame_rate || '0/1').split('/').map(Number);
    const fps = n / d;
    rows.push({ name: out, from: name, width: v?.width, height: v?.height, fps, frames: Number(v?.nb_frames) || null, tags: [v?.color_space, v?.color_primaries, v?.color_transfer].map((x) => x || '-').join('/'), audio: info.streams.some((s) => s.codec_type === 'audio'), md5: hash.slice(0, 10), still: STILL.test(out), ok: cfg ? v?.width === cfg.width && v?.height === cfg.height && Math.abs(fps - cfg.fps) < 1e-3 : null });
  }
  const L = [
    '# Ingested takes',
    '',
    `From \`${path.basename(src)}\`${since ? `, files modified in the last ${since}` : ''}, matching \`${match || 'any video or still'}\`, on ${new Date(now).toISOString()}.`,
    '',
    '| Take | Downloaded as | Size | fps | Frames | Colour tags | Audio | md5 | Film format |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => (r.skipped ? `| - | ${r.name} | | | | | | | skipped: ${r.skipped} |` : `| ${r.name} | ${r.from} | ${r.width}x${r.height} | ${r.fps.toFixed(3)} | ${r.frames ?? '-'} | ${r.tags} | ${r.audio ? 'yes (discarded at cut)' : 'no'} | ${r.md5} | ${r.still ? 'still: held shot at cut' : r.ok == null ? '-' : r.ok ? 'yes' : '**no: conformed at cut if used, never upscaled here**'} |`)),
    '',
    'Next: `briefcut sheets <dir> --takes`, look at each sheet, choose one take per scene, copy it to `clips/<SCENE>.<ext>`, move the others to `clips/_rejected/`, and write `clips/NOTES.md` (used, rejected, why, known deviations).',
    '',
  ];
  const file = path.join(dest, 'INGEST.md');
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') + '\n' : '';
  fs.writeFileSync(file, prev + L.join('\n'));
  log?.info(`ingested ${rows.filter((r) => !r.skipped).length} take(s) into clips/_takes (${rows.filter((r) => r.skipped).length} duplicate(s) skipped)`);
  return rows;
}

function md5(file) {
  return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
}
