// Voice audition: the role's line is generated with each candidate voice (through the asset cache,
// with exactly the request the cut will make, so the chosen take is reused, never paid twice),
// each take is measured, and the lowest, fullest voice is picked. The pick is frozen in
// audio/audition_<role>.json and the comparison written to out/AUDITION.md.
import fs from 'node:fs';
import path from 'node:path';
import { loadAudio } from './assets.mjs';
import { SR, CH, readJson, writeJson, ensureDir } from './util.mjs';

// In-place radix-2 FFT of (re, im), length a power of two.
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(a * k);
        const wi = Math.sin(a * k);
        const xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k + len / 2] = re[i + k] - xr;
        im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr;
        im[i + k] += xi;
      }
    }
  }
}

// Fundamental (median over voiced frames, normalized autocorrelation, 60-300 Hz), spectral
// centroid (average magnitude spectrum of voiced frames, 60-8000 Hz) and low share (power
// 80-300 Hz as a share of 80-8000 Hz) of a voice take. Voiced = frame RMS within 25 dB of the
// loudest frame.
export function voiceStats(pcm, sr = SR) {
  const n = pcm.length / CH;
  const mono = new Float64Array(n);
  for (let i = 0; i < n; i++) mono[i] = (pcm[i * CH] + pcm[i * CH + 1]) / 2;
  const N = 2048;
  const hop = 512;
  const frames = [];
  for (let s = 0; s + N <= n; s += hop) {
    let e = 0;
    for (let i = s; i < s + N; i++) e += mono[i] ** 2;
    frames.push({ s, rms: Math.sqrt(e / N) });
  }
  const top = Math.max(...frames.map((f) => f.rms));
  const voiced = frames.filter((f) => f.rms >= top * 10 ** (-25 / 20));
  const f0s = [];
  const minLag = Math.floor(sr / 300);
  const maxLag = Math.ceil(sr / 60);
  const mag = new Float64Array(N / 2);
  const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  for (const f of voiced) {
    const x = mono.subarray(f.s, f.s + N);
    let e0 = 0;
    for (let i = 0; i < N; i++) e0 += x[i] * x[i];
    let best = 0;
    let lag = 0;
    for (let L = minLag; L <= Math.min(maxLag, N - 1); L++) {
      let c = 0;
      let e1 = 0;
      for (let i = 0; i + L < N; i++) {
        c += x[i] * x[i + L];
        e1 += x[i + L] * x[i + L];
      }
      const r = c / Math.sqrt(e0 * e1 + 1e-20);
      if (r > best) ((best = r), (lag = L));
    }
    if (best > 0.5 && lag) f0s.push(sr / lag);
    const re = Float64Array.from(x, (v, i) => v * win[i]);
    const im = new Float64Array(N);
    fft(re, im);
    for (let k = 0; k < N / 2; k++) mag[k] += Math.hypot(re[k], im[k]);
  }
  const hz = (k) => (k * sr) / N;
  let num = 0;
  let den = 0;
  let low = 0;
  let all = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = hz(k);
    if (f >= 60 && f <= 8000) ((num += f * mag[k]), (den += mag[k]));
    if (f >= 80 && f <= 8000) {
      all += mag[k] ** 2;
      if (f <= 300) low += mag[k] ** 2;
    }
  }
  f0s.sort((a, b) => a - b);
  return { f0: f0s.length ? f0s[Math.floor(f0s.length / 2)] : null, centroid: den ? num / den : null, lowShare: all ? low / all : null, voicedFrames: voiced.length };
}

// Lowest and fullest: rank by fundamental and by centroid (both ascending), sum the ranks; a tie
// goes to the larger low share.
export function pickVoice(rows) {
  const ok = rows.filter((r) => r.f0 != null && r.centroid != null);
  const rank = (key) => new Map([...ok].sort((a, b) => a[key] - b[key]).map((r, i) => [r, i + 1]));
  const rf = rank('f0');
  const rc = rank('centroid');
  for (const r of ok) r.score = rf.get(r) + rc.get(r);
  return [...ok].sort((a, b) => a.score - b.score || b.lowShare - a.lowShare)[0] || null;
}

// Runs (or reuses) the audition for one role. `make(voice)` returns the cached take for that voice
// ({ file, name, cached }); `resolve(name)` looks the voice up in the account.
export async function auditionRole({ key, role, text, audioDir, outDir, resolve, make, log }) {
  const frozenFile = path.join(audioDir, `audition_${key}.json`);
  const frozen = readJson(frozenFile);
  const sig = JSON.stringify({ candidates: role.candidates, settings: role.settings, model: role.model, text });
  if (frozen?.sig === sig) {
    log?.info(`${role.name}: audition pick "${frozen.pick}" (frozen, ${path.basename(frozenFile)})`);
    return resolve(frozen.pick);
  }
  const rows = [];
  for (const name of role.candidates) {
    let v;
    try {
      v = await resolve(name);
    } catch {
      rows.push({ asked: name, missing: true });
      continue;
    }
    const take = await make(v);
    rows.push({ asked: name, voice: v, file: take.name, cached: take.cached, ...voiceStats(await loadAudio(take.file)) });
  }
  const pick = pickVoice(rows);
  if (!pick) throw new Error(`audition for ${role.name}: no candidate voice could be measured`);
  writeJson(frozenFile, { sig, pick: pick.asked, rows: rows.map(({ voice, ...r }) => ({ ...r, voiceName: voice?.name })) });
  const L = [
    `# Voice audition: ${role.name}`,
    '',
    `Line \`${text}\`, model \`${role.model}\`, settings ${Object.entries(role.settings).map(([k, v]) => `${k} ${v}`).join(', ')}. Each take measured over its voiced frames (within 25 dB of the loudest 43 ms frame): fundamental = median of a normalized autocorrelation pitch track (60-300 Hz); spectral centroid = centroid of the average magnitude spectrum, 60-8000 Hz; low share = power 80-300 Hz as a share of 80-8000 Hz. Pick: the lowest and fullest voice, by the sum of its ranks for fundamental and centroid (lower is better), ties to the larger low share.`,
    '',
    '| Candidate | Voice in the account | Fundamental (Hz) | Spectral centroid (Hz) | Low share | Rank sum | Take |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((r) => (r.missing ? `| ${r.asked} | not in the account | - | - | - | - | - |` : `| ${r.asked}${r === pick ? ' **(picked)**' : ''} | ${r.voice.name} | ${r.f0?.toFixed(1) ?? '-'} | ${r.centroid?.toFixed(0) ?? '-'} | ${r.lowShare != null ? `${(r.lowShare * 100).toFixed(1)}%` : '-'} | ${r.score ?? '-'} | ${r.file}${r.cached ? ' (cached)' : ''} |`)),
    '',
  ];
  fs.writeFileSync(path.join(ensureDir(outDir), 'AUDITION.md'), L.join('\n'));
  log?.assume('voices', `${role.name}: audition of ${rows.filter((r) => !r.missing).length} voices; picked "${pick.voice.name}" (fundamental ${pick.f0.toFixed(1)} Hz, centroid ${pick.centroid.toFixed(0)} Hz, low share ${(pick.lowShare * 100).toFixed(1)}%), see out/AUDITION.md`);
  return pick.voice;
}
