// `briefcut regress <dir> <outDir>`: re-render a finished film in a mirror folder, without
// touching the original, and compare the new master with the old one: format, frames, loudness,
// per-frame picture hashes, decoded audio, and the edit and cue tables of the two reports.
// Records the hash of every briefcut source file used. Writes <outDir>/REGRESSION.md.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ffmpeg, probe, decode, measureR128 } from './ff.mjs';
import { ensureDir, exists, db, f2, t3 } from './util.mjs';
import { cutFilm } from './cut.mjs';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function regress({ filmDir, outDir, log, offline = true }) {
  filmDir = path.resolve(filmDir);
  outDir = ensureDir(path.resolve(outDir));
  const mirror = path.join(outDir, path.basename(filmDir));
  fs.rmSync(mirror, { recursive: true, force: true });
  ensureDir(path.join(mirror, 'out'));
  const copied = [];
  const copy = (rel) => {
    if (!exists(path.join(filmDir, rel))) return;
    fs.cpSync(path.join(filmDir, rel), path.join(mirror, rel), { recursive: true });
    copied.push(rel.replace(/\\/g, '/'));
  };
  for (const f of fs.readdirSync(filmDir)) if (/BRIEF\.md$|_FIX\d+\.md$|^pronunciations\.json$|^OPEN_QUESTIONS\.md$/i.test(f)) copy(f);
  copy('clips');
  copy('audio');
  copy(path.join('out', 'cues.md'));
  const files = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(mjs|json)$/.test(f)) files.push({ f: path.relative(SRC, p).replace(/\\/g, '/'), sha: crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 10) });
    }
  };
  walk(SRC);
  const started = Date.now();
  const res = await cutFilm({ filmDir: mirror, offline, quiet: true });
  const seconds = (Date.now() - started) / 1000;
  const ref = path.join(filmDir, 'out', res.cfg.export.master);
  const neu = res.masterFile;
  const info = async (f) => {
    const p = await probe(f);
    const v = p.streams.find((s) => s.codec_type === 'video');
    return { dur: Number(p.format.duration), frames: Number(v.nb_frames), size: `${v.width}x${v.height}`, fps: v.r_frame_rate, loud: await measureR128(f) };
  };
  const a = await info(ref);
  const b = await info(neu);
  const hashes = async (f) => (await ffmpeg(['-v', 'error', '-i', f, '-map', '0:v', '-f', 'framemd5', '-'])).stdout.toString().split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => l.split(',').pop().trim());
  const ha = await hashes(ref);
  const hb = await hashes(neu);
  const same = ha.filter((h, i) => h === hb[i]).length;
  const pa = await decode(ref);
  const pb = await decode(neu);
  let diff = 0;
  let sig = 0;
  let maxd = 0;
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const d = pa[i] - pb[i];
    diff += d * d;
    sig += pa[i] * pa[i];
    maxd = Math.max(maxd, Math.abs(d));
  }
  const identical = maxd === 0 && pa.length === pb.length;
  const residual = sig ? db(Math.sqrt(diff / sig)) : -Infinity;
  const table = (file, heading) => {
    const t = fs.readFileSync(file, 'utf8');
    const s = t.indexOf(heading);
    if (s < 0) return [];
    return t.slice(s).split(/\r?\n/).slice(2).filter((l, i, arr) => l.startsWith('|') && arr.slice(0, i).every((x) => x.startsWith('|') || !x.trim())).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  };
  const cmp = (heading, cols) => {
    const x = table(path.join(filmDir, 'out', 'REPORT.md'), heading);
    const y = table(path.join(mirror, 'out', 'REPORT.md'), heading);
    const pick = (r) => cols.map((c) => r[c]).join('|');
    const diffs = x.map((r, i) => (pick(r) !== pick(y[i] || []) ? `row ${i + 1}` : null)).filter(Boolean);
    return { same: x.length === y.length && !diffs.length, diffs, rows: x.length };
  };
  const edl = cmp('## Edit decision list', [1, 3, 5]);
  const cues = cmp('## Cues', [0, 1, 2, 6, 8]);
  const ok = (v) => (v ? 'PASS' : 'FAIL');
  const pictureOk = same === ha.length && ha.length === hb.length;
  const audioOk = identical || residual < -60;
  const specOk = a.size === b.size && a.fps === b.fps && a.frames === b.frames;
  const loudOk = Math.abs(a.loud.I - b.loud.I) <= 0.1 && Math.abs(a.loud.TP - b.loud.TP) <= 0.1;
  const all = pictureOk && audioOk && specOk && loudOk && edl.same && cues.same;
  const L = [
    `# Regression: ${path.basename(filmDir)}`,
    '',
    `Run ${new Date().toISOString()} (${seconds.toFixed(0)} s) on a mirror; the film folder was only read. Mirrored: ${copied.map((c) => `\`${c}\``).join(', ')}. ${offline ? 'Offline: audio from the cache only.' : ''}`,
    '',
    `## Result: ${all ? 'PASS, the new master matches the existing one' : 'DIFFERENCES'}`,
    '',
    '| Check | Existing | New | Result |',
    '|---|---|---|---|',
    `| Format, frames | ${a.size} @ ${a.fps}, ${a.frames} fr, ${t3(a.dur)} s | ${b.size} @ ${b.fps}, ${b.frames} fr, ${t3(b.dur)} s | ${ok(specOk)} |`,
    `| Loudness | ${f2(a.loud.I)} LUFS, ${f2(a.loud.TP)} dBTP | ${f2(b.loud.I)} LUFS, ${f2(b.loud.TP)} dBTP | ${ok(loudOk)} |`,
    `| Picture (framemd5) | ${ha.length} frames | ${hb.length} frames | ${ok(pictureOk)}: ${same}/${ha.length} identical |`,
    `| Audio (decoded) | | | ${ok(audioOk)}: ${identical ? 'bit-identical' : `max difference ${f2(db(maxd))} dBFS, residual ${f2(residual)} dB`} |`,
    `| EDL table | | | ${ok(edl.same)}${edl.diffs.length ? `: ${edl.diffs.join(', ')}` : ''} |`,
    `| Cue table | | | ${ok(cues.same)}${cues.diffs.length ? `: ${cues.diffs.slice(0, 8).join(', ')}` : ''} |`,
    '',
    '## briefcut files at run time',
    '',
    '| File | sha1 |',
    '|---|---|',
    ...files.map((x) => `| \`${x.f}\` | ${x.sha} |`),
    '',
  ];
  fs.writeFileSync(path.join(outDir, 'REGRESSION.md'), L.join('\n'));
  log?.info(`${all ? 'PASS' : 'DIFFERENCES'}: ${path.join(outDir, 'REGRESSION.md')}`);
  return { pass: all, pictureOk, audioOk, specOk, loudOk, edl, cues };
}
