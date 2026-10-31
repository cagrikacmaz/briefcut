// ffmpeg / ffprobe: location, process runner, decode to float PCM, WAV writer, loudness meters.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { SR, CH } from './util.mjs';

let bins = null;
let filterList = null;

function versionKey(name) {
  return (name.match(/\d+/g) || []).map(Number);
}

function cmpVersion(a, b) {
  const x = versionKey(a);
  const y = versionKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

// FFMPEG_DIR wins, then PATH, then (Windows) the newest WinGet FFmpeg package.
export function locate() {
  if (bins) return bins;
  const exe = process.platform === 'win32' ? '.exe' : '';
  const fromDir = (dir) => ({ ffmpeg: path.join(dir, 'ffmpeg' + exe), ffprobe: path.join(dir, 'ffprobe' + exe) });
  if (process.env.FFMPEG_DIR && fs.existsSync(fromDir(process.env.FFMPEG_DIR).ffmpeg)) {
    return (bins = fromDir(process.env.FFMPEG_DIR));
  }
  const onPath = spawnSync('ffmpeg', ['-hide_banner', '-version'], { windowsHide: true });
  if (!onPath.error && onPath.status === 0) return (bins = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' });
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const pkgs = path.join(local, 'Microsoft', 'WinGet', 'Packages');
  if (process.platform === 'win32' && fs.existsSync(pkgs)) {
    const candidates = [];
    for (const pkg of fs.readdirSync(pkgs).filter((d) => /ffmpeg/i.test(d))) {
      for (const build of fs.readdirSync(path.join(pkgs, pkg))) {
        const dir = path.join(pkgs, pkg, build, 'bin');
        if (fs.existsSync(path.join(dir, 'ffmpeg' + exe))) candidates.push({ build, dir });
      }
    }
    candidates.sort((a, b) => cmpVersion(b.build, a.build));
    if (candidates.length) return (bins = fromDir(candidates[0].dir));
  }
  throw new Error('ffmpeg not found: install ffmpeg, put it on PATH, or set FFMPEG_DIR');
}

export function run(bin, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    const out = [];
    let err = '';
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) reject(new Error(`${path.basename(bin)} exited ${code}: ${err.slice(-1500)}`));
      else resolve({ stdout: Buffer.concat(out), stderr: err });
    });
    if (input) p.stdin.end(input);
    else p.stdin.end();
  });
}

export const ffmpeg = (args, opts) => run(locate().ffmpeg, ['-hide_banner', '-nostdin', ...args], opts);
export const ffprobe = (args) => run(locate().ffprobe, ['-v', 'error', ...args]);

// Some ffmpeg builds (slim package-manager builds) lack drawtext or rubberband.
export function hasFilter(name) {
  if (!filterList) {
    const r = spawnSync(locate().ffmpeg, ['-hide_banner', '-filters'], { windowsHide: true, encoding: 'utf8' });
    filterList = r.stdout || '';
  }
  return new RegExp(`\\s${name}\\s`).test(filterList);
}

export async function probe(file) {
  const { stdout } = await ffprobe(['-show_streams', '-show_format', '-of', 'json', file]);
  return JSON.parse(stdout.toString());
}

// Decode any audio file to interleaved float32 at `sr`/`ch`.
export async function decode(file, { sr = SR, ch = CH, af } = {}) {
  const args = ['-v', 'error', '-i', file, '-vn'];
  if (af) args.push('-af', af);
  args.push('-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', String(ch), '-ar', String(sr), '-');
  const { stdout } = await ffmpeg(args);
  return new Float32Array(stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength));
}

export function writeWavFloat(file, data, sr = SR, ch = CH) {
  const bytes = data.length * 4;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + bytes, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(3, 20); // IEEE float
  h.writeUInt16LE(ch, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * ch * 4, 28);
  h.writeUInt16LE(ch * 4, 32);
  h.writeUInt16LE(32, 34);
  h.write('data', 36);
  h.writeUInt32LE(bytes, 40);
  fs.writeFileSync(file, Buffer.concat([h, Buffer.from(data.buffer, data.byteOffset, bytes)]));
}

// The JSON block loudnorm prints to stderr.
export function parseLoudnormJson(stderr) {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  return JSON.parse(stderr.slice(start, end + 1));
}

// EBU R128 summary of a file: integrated loudness, LRA and true peak.
export async function measureR128(file) {
  const { stderr } = await ffmpeg(['-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-']);
  return parseR128Summary(stderr);
}

export function parseR128Summary(stderr) {
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const num = (re) => {
    const m = summary.match(re);
    return m ? (m[1] === '-inf' ? -Infinity : Number(m[1])) : NaN;
  };
  return {
    I: num(/I:\s+(-?[\d.]+|-inf)\s+LUFS/),
    LRA: num(/LRA:\s+(-?[\d.]+)\s+LU/),
    TP: num(/Peak:\s+(-?[\d.]+|-inf)\s+dBFS/),
  };
}

// Momentary loudness (400 ms window) per 100 ms frame: [{ t, M }].
export async function momentaryLoudness(file) {
  const { stdout } = await ffmpeg(['-v', 'error', '-i', file, '-vn', '-af', 'ebur128=metadata=1,ametadata=print:key=lavfi.r128.M:file=-', '-f', 'null', '-']);
  const out = [];
  let t = null;
  for (const line of stdout.toString().split(/\r?\n/)) {
    const pt = line.match(/pts_time:([\d.]+)/);
    if (pt) t = Number(pt[1]);
    const m = line.match(/lavfi\.r128\.M=(-?[\d.]+|-inf|nan)/);
    if (m && t != null) out.push({ t, M: /inf|nan/.test(m[1]) ? -Infinity : Number(m[1]) });
  }
  return out;
}
