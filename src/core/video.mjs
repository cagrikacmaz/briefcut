// Picture: probe and conform, colour pipeline, frame-exact render with hard cuts, end card,
// mux, preview, 16:9 export, and the small images agents look at.
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, probe, hasFilter } from './ff.mjs';
import { ensureDir } from './util.mjs';

const FONT_DIRS = ['C:/Windows/Fonts', '/usr/share/fonts/truetype/dejavu', '/usr/share/fonts/dejavu', '/usr/share/fonts/TTF', '/Library/Fonts', '/System/Library/Fonts/Supplemental', '/System/Library/Fonts'];
const SANS = ['arial.ttf', 'Arial.ttf', 'DejaVuSans.ttf', 'Helvetica.ttc'];

export function findFont(candidates = []) {
  for (const c of [...candidates, ...SANS]) {
    if (path.isAbsolute(c) && fs.existsSync(c)) return c;
    for (const d of FONT_DIRS) {
      const p = path.join(d, path.basename(c));
      if (fs.existsSync(p)) return p.replace(/\\/g, '/');
    }
  }
  return null;
}

// Path inside a filter option: forward slashes, escaped drive colon, quoted.
export const filterPath = (p) => `'${p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")}'`;

const textOk = () => hasFilter('drawtext');
const fontOpt = (font) => (font ? `fontfile=${filterPath(font)}:` : '');

export async function probeClip(file, cfg, log) {
  const info = await probe(file);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const [num, den] = v.r_frame_rate.split('/').map(Number);
  const fps = num / den;
  const clip = { file, width: v.width, height: v.height, fps, frames: Number(v.nb_frames) || Math.round(Number(v.duration || info.format.duration) * fps), hasAudio: info.streams.some((s) => s.codec_type === 'audio'), colorTags: [v.color_space, v.color_primaries, v.color_transfer, v.color_range].map((x) => x || '-').join('/') };
  clip.conform = clip.width !== cfg.width || clip.height !== cfg.height || Math.abs(fps - cfg.fps) > 1e-3;
  if (clip.conform) {
    log?.assume('conform', `${path.basename(file)} is ${clip.width}x${clip.height} @ ${fps.toFixed(3)} fps; conformed to ${cfg.width}x${cfg.height} @ ${cfg.fps} (scale and pad, frame-rate conversion by frame selection, never a speed change)`);
    clip.frames = Math.round((Number(info.format.duration) || clip.frames / fps) * cfg.fps);
  }
  return clip;
}

const fpsChain = (clip, cfg) => (clip.conform ? `fps=${cfg.fps},` : '');

// BT.709 limited range and tags on every clip (generated sources carry mixed tags), then the
// optional shot match and the film's grade.
export function colorChain(cfg, e = null) {
  const { width: W, height: H } = cfg;
  const scale = `scale=${W}:${H}:flags=lanczos:force_original_aspect_ratio=decrease:in_color_matrix=auto:in_range=auto:out_color_matrix=bt709:out_range=tv,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
  const tags = 'setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv';
  return `${scale},${tags}${matchChain(e)}${cfg.video.grade ? `,${cfg.video.grade}` : ''}`;
}

export function matchChain(e) {
  const m = e?.match;
  if (!m) return '';
  const lin = `val*${m.a.toFixed(4)}${m.b < 0 ? '-' : '+'}${Math.abs(m.b).toFixed(2)}`;
  const c = `clip((val-128)*${m.k.toFixed(4)}+128\\,16\\,240)`;
  return `,lutyuv=y=clip(${lin}\\,16\\,235):u=${c}:v=${c}`;
}

export const BT709 = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];

// End card: a black (or brief-coloured) frame with centred lines that fade in.
export function cardChain(cfg, workDir) {
  const ec = cfg.endCard;
  const font = findFont(ec.fonts);
  const parts = [];
  if (textOk() && ec.lines.length) {
    const H = cfg.height;
    const sizes = ec.lines.map((l) => Math.round((l.size === 'large' ? 0.06 : 0.026) * Math.min(H, cfg.width * 1.78)));
    const gap = Math.round(sizes[0] * 0.35);
    const total = sizes.reduce((a, b) => a + b, 0) + gap * (sizes.length - 1);
    let y = Math.round(H / 2 - total / 2);
    ec.lines.forEach((l, i) => {
      const tf = path.join(workDir, `card_line_${i}.txt`);
      fs.writeFileSync(tf, l.text);
      const alpha = `${(l.opacity ?? 1).toFixed(3)}*min(1\\,t/${Math.max(0.001, ec.fadeIn).toFixed(3)})`;
      parts.push(`drawtext=${fontOpt(font)}textfile=${filterPath(tf)}:fontsize=${sizes[i]}:fontcolor=white:alpha='${alpha}':x=(w-text_w)/2:y=${y}`);
      y += sizes[i] + gap;
    });
  }
  return { chain: parts.join(','), font, text: textOk() };
}

async function renderChunk(entries, cfg, out, workDir) {
  const args = ['-y', '-v', 'error'];
  const parts = [];
  entries.forEach((e, k) => {
    if (e.kind === 'card') {
      const d = (e.outF - e.inF) / cfg.fps;
      args.push('-f', 'lavfi', '-i', `color=c=${cfg.endCard.background || 'black'}:s=${cfg.width}x${cfg.height}:r=${cfg.fps}:d=${d.toFixed(6)}`);
      const { chain } = cardChain(cfg, workDir);
      parts.push(`[${k}:v]format=yuv420p,setsar=1,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv${chain ? `,${chain}` : ''},trim=end_frame=${e.outF - e.inF},setpts=PTS-STARTPTS[v${k}]`);
    } else {
      args.push('-i', e.clip.file);
      parts.push(`[${k}:v]${fpsChain(e.clip, cfg)}trim=start_frame=${e.inF}:end_frame=${e.outF},setpts=PTS-STARTPTS,${colorChain(cfg, e)}[v${k}]`);
    }
  });
  const filter = `${parts.join(';')};${entries.map((_, k) => `[v${k}]`).join('')}concat=n=${entries.length}:v=1:a=0,format=yuv420p[v]`;
  fs.writeFileSync(path.join(workDir, 'render_graph.txt'), filter + '\n');
  args.push('-filter_complex', filter, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', cfg.export.x264Preset, '-crf', String(cfg.export.crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p', ...BT709, '-r', String(cfg.fps), '-fps_mode', 'cfr', '-movflags', '+faststart', out);
  await ffmpeg(args);
  return filter;
}

// Frame-exact hard cuts: one trim per entry, concatenated, encoded once.
export async function renderPicture(entries, cfg, out, workDir) {
  return renderChunk(entries, cfg, out, workDir);
}

// The filter graph may only contain trims, scaling, colour, card text and concat: no speed
// change, reverse, freeze, zoom or transition. Returns the offending filters (empty = pass).
export function retimeFilters(graph) {
  const banned = /\b(setpts=(?!PTS-STARTPTS)[^,;\]]+|atempo|reverse|tpad|loop|zoompan|xfade|framerate|minterpolate|tblend|fade=)/g;
  return [...graph.matchAll(banned)].map((m) => m[1]);
}

export async function mux(picture, wav, cfg, out) {
  await ffmpeg(['-y', '-v', 'error', '-i', picture, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', `${cfg.export.aacKbps}k`, '-ar', String(cfg.export.sampleRate), '-ac', '2', '-movflags', '+faststart', out]);
}

export async function renderPreview(master, cfg, out) {
  // "360p" is 360 px on the short side, for vertical and horizontal films alike.
  const h = cfg.export.previewHeight;
  const long = Math.round((h * Math.max(cfg.width, cfg.height)) / Math.min(cfg.width, cfg.height) / 2) * 2;
  const [w2, h2] = cfg.height > cfg.width ? [h, long] : [long, h];
  await ffmpeg(['-y', '-v', 'error', '-i', master, '-vf', `scale=${w2}:${h2}:flags=lanczos:in_color_matrix=bt709:in_range=tv:out_color_matrix=bt709:out_range=tv`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '26', '-pix_fmt', 'yuv420p', ...BT709, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]);
}

// 16:9 export of a vertical film: the film centred on a blurred, darkened copy of itself.
export async function renderWide(master, cfg, out, { width = 1920, height = 1080 } = {}) {
  const vf = `[0:v]split=2[a][b];[a]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=40,eq=brightness=-0.12:saturation=0.8[bg];[b]scale=-2:${height}:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:0,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv[v]`;
  await ffmpeg(['-y', '-v', 'error', '-i', master, '-filter_complex', vf, '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', cfg.export.x264Preset, '-crf', String(cfg.export.crf), '-pix_fmt', 'yuv420p', ...BT709, '-c:a', 'copy', '-movflags', '+faststart', out]);
}

// Extract given frame numbers of a video as PNGs, `width` px wide, in one decode pass.
// Returns the file paths in the order of `frames` (duplicates allowed).
export async function extractFrames(file, frames, dir, { width = 180, pre = '' } = {}) {
  ensureDir(dir);
  for (const f of fs.readdirSync(dir)) if (/^x_\d+\.png$/.test(f)) fs.unlinkSync(path.join(dir, f));
  const uniq = [...new Set(frames)].sort((a, b) => a - b);
  const sel = uniq.map((f) => `eq(n\\,${f})`).join('+');
  await ffmpeg(['-y', '-v', 'error', '-i', file, '-an', '-vf', `${pre}select='${sel}',scale=${width}:-2`, '-fps_mode', 'passthrough', path.join(dir, 'x_%04d.png')]);
  const map = new Map(uniq.map((f, i) => [f, path.join(dir, `x_${String(i + 1).padStart(4, '0')}.png`)]));
  return frames.map((f) => map.get(f));
}

// Burn a multi-line label (text file) into a small image.
export async function labelImage(src, out, label, workDir, { size = 14, bottom = false } = {}) {
  if (!textOk()) {
    fs.copyFileSync(src, out);
    return;
  }
  const tf = path.join(workDir, `${path.basename(out)}.txt`);
  fs.writeFileSync(tf, label);
  const font = findFont();
  const y = bottom ? 'h-text_h-4' : '4';
  await ffmpeg(['-y', '-v', 'error', '-i', src, '-vf', `drawtext=${fontOpt(font)}textfile=${filterPath(tf)}:x=4:y=${y}:fontsize=${size}:fontcolor=black:box=1:boxcolor=white@0.85:line_spacing=2`, out]);
}

// Tile a list of images (same size) into one sheet, `cols` wide, white padding.
export async function tile(files, cols, out, workDir) {
  const dir = ensureDir(path.join(workDir, `tile_${path.basename(out, path.extname(out))}`));
  for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
  files.forEach((f, i) => fs.copyFileSync(f, path.join(dir, `t_${String(i + 1).padStart(4, '0')}.png`)));
  const rows = Math.ceil(files.length / cols);
  await ffmpeg(['-y', '-v', 'error', '-framerate', '1', '-i', path.join(dir, 't_%04d.png'), '-vf', `tile=${cols}x${rows}:padding=4:color=white`, '-frames:v', '1', '-q:v', '3', out]);
}

// Owner's EDL sheet: the middle frame of every shot, labelled, side by side.
export async function edlSheet(entries, cfg, picture, out, workDir) {
  const mids = entries.map((e) => Math.floor((e.tlStartF + e.tlEndF) / 2));
  const dir = ensureDir(path.join(workDir, 'edl'));
  const imgs = await extractFrames(picture, mids, dir, { width: cfg.sync.sheetWidth });
  const labelled = [];
  for (const [i, e] of entries.entries()) {
    const o = path.join(dir, `l_${i}.png`);
    await labelImage(imgs[i], o, `${i + 1} ${e.source}\n${(e.inF / cfg.fps).toFixed(2)}-${(e.outF / cfg.fps).toFixed(2)} s`, dir);
    labelled.push(o);
  }
  await tile(labelled, Math.min(8, labelled.length), out, workDir);
}

// Per-frame motion energy: mean absolute luma difference on a 90 px proxy.
export async function motionProfile(file) {
  const { stdout } = await ffmpeg(['-v', 'error', '-i', file, '-an', '-vf', 'scale=90:-2,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-']);
  const v = [...stdout.toString().matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
  return v.length ? [v[0], ...v] : v;
}

// Mean luma per frame (0-255) on a small proxy.
export async function lumaProfile(file) {
  const { stdout } = await ffmpeg(['-v', 'error', '-i', file, '-an', '-vf', 'scale=64:-2,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-']);
  return [...stdout.toString().matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
}

// Grey 64 px proxy of the first or last frame, for comparisons.
export async function edgeFrame(file, which) {
  const pre = which === 'last' ? ['-sseof', '-0.5'] : [];
  const { stdout } = await ffmpeg(['-v', 'error', ...pre, '-i', file, '-an', '-vf', 'scale=64:64:flags=area,format=gray', '-f', 'rawvideo', '-']);
  const frameSize = 64 * 64;
  const frames = Math.max(1, Math.floor(stdout.length / frameSize));
  const k = which === 'last' ? frames - 1 : 0;
  const px = stdout.subarray(k * frameSize, (k + 1) * frameSize);
  let s = 0;
  for (const b of px) s += b;
  return { pixels: px, mean: s / Math.max(1, px.length) };
}
