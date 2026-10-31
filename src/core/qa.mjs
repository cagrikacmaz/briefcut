// QA measurements. Everything here reads the exported master (or the mix that produced it); a
// check that fails stays FAIL in the report.
import { ffmpeg, momentaryLoudness } from './ff.mjs';
import { SR, CH, db } from './util.mjs';

// Stretches below floorDb longer than minSeconds (silencedetect on the file).
export async function silences(file, floorDb, minSeconds, duration) {
  const { stderr } = await ffmpeg(['-nostats', '-i', file, '-vn', '-af', `silencedetect=noise=${floorDb}dB:d=${minSeconds}`, '-f', 'null', '-']);
  const starts = [...stderr.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  return starts.map((s, i) => ({ start: Math.max(0, s), end: ends[i] ?? duration }));
}

// Where a placed sound actually starts in `pcm` (interleaved stereo): the hit's own first 80 ms
// are cross-correlated against the file within ±maxLagMs of where it was placed. Returns the
// measured shift in samples (positive = later than placed) and the normalized correlation.
export function measureShift(pcm, template, placedSample, { maxLagMs = 170, windowMs = 80 } = {}) {
  const maxLag = Math.round((maxLagMs / 1000) * SR);
  const n = Math.min(template.length / CH, Math.round((windowMs / 1000) * SR));
  const total = pcm.length / CH;
  let tt = 0;
  for (let i = 0; i < n; i++) for (let c = 0; c < CH; c++) tt += template[i * CH + c] ** 2;
  let best = { lag: 0, r: -Infinity };
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let xy = 0;
    let yy = 0;
    for (let i = 0; i < n; i++) {
      const j = placedSample + lag + i;
      if (j < 0 || j >= total) continue;
      for (let c = 0; c < CH; c++) {
        const y = pcm[j * CH + c];
        xy += template[i * CH + c] * y;
        yy += y * y;
      }
    }
    const r = xy / Math.sqrt(tt * yy + 1e-20);
    if (r > best.r) best = { lag, r };
  }
  return best;
}

// Music silent after a hard stop: peak of the A4 stem from `from` seconds, in dBFS, after `gainDb`.
export function peakAfter(stem, from, gainDb = 0) {
  let p = 0;
  for (let i = Math.max(0, Math.round(from * SR)) * CH; i < stem.length; i++) p = Math.max(p, Math.abs(stem[i]));
  return db(p) + gainDb;
}

// Loudest moment by momentary loudness (400 ms): its time and value.
export async function loudestMoment(file) {
  const m = await momentaryLoudness(file);
  let best = { t: null, M: -Infinity };
  for (const x of m) if (x.M > best.M) best = x;
  return { ...best, series: m };
}

// "The last N s before the card stay within X LU of the strike": the reference is the highest
// momentary value in the 1.5 s after `refAt`; the checked windows are the 400 ms windows that lie
// wholly inside [from, to] (window end from + 0.4 to `to`).
export function tailLoudness(series, { from, to, refAt, lu }) {
  const ref = refAt == null ? null : series.filter((p) => p.t > refAt && p.t <= refAt + 1.5).reduce((a, p) => (p.M > a.M ? p : a), { t: null, M: -Infinity });
  const win = series.filter((p) => p.t >= from + 0.4 - 1e-6 && p.t <= to + 1e-6);
  const low = win.reduce((a, p) => (p.M < a.M ? p : a), { t: null, M: Infinity });
  const ok = ref != null && ref.t != null && win.length > 0 && low.M >= ref.M - lu;
  return { ref, low, gap: ref && low.t != null ? ref.M - low.M : null, from, to, lu, ok };
}

export function samplePeakDb(pcm) {
  let p = 0;
  let clipped = 0;
  for (let i = 0; i < pcm.length; i++) {
    const a = Math.abs(pcm[i]);
    if (a > p) p = a;
    if (a >= 0.999) clipped++;
  }
  return { peakDb: db(p), clipped };
}

// Song block audio: the premix over the block must be the song sample for sample with nothing
// else in it; the master over the block must be the song times one gain (the limiter left it).
export function checkSongBlock(premix, stems, songPcm, startSample, blockSamples, masterPcm = null) {
  let exact = true;
  let firstDiff = null;
  for (let i = 0; i < blockSamples * CH; i++) {
    const want = i < songPcm.length ? songPcm[i] : 0;
    if (premix[startSample * CH + i] !== want) {
      exact = false;
      firstDiff ??= Math.floor(i / CH);
    }
  }
  let others = 0;
  for (const s of stems) for (let i = startSample * CH; i < (startSample + blockSamples) * CH; i++) if (s[i] !== 0) others++;
  let gain = null;
  let residualDb = null;
  let lag = 0;
  if (masterPcm) {
    const n = Math.min(songPcm.length, (masterPcm.length / CH - startSample - 8) * CH);
    let best = null;
    for (let d = -8; d <= 8; d++) {
      let xy = 0;
      let yy = 0;
      for (let i = 0; i < n; i++) {
        const j = (startSample + d) * CH + i;
        if (j < 0) continue;
        xy += masterPcm[j] * songPcm[i];
        yy += songPcm[i] * songPcm[i];
      }
      const k = xy / Math.max(1e-20, yy);
      let ee = 0;
      for (let i = 0; i < n; i++) {
        const j = (startSample + d) * CH + i;
        if (j < 0) continue;
        ee += (masterPcm[j] - k * songPcm[i]) ** 2;
      }
      const res = db(Math.sqrt(ee / Math.max(1e-20, k * k * yy)));
      if (!best || res < best.res) best = { res, k, d };
    }
    ({ res: residualDb, k: gain, d: lag } = best);
  }
  return { exact, firstDiffSample: firstDiff, otherTrackSamples: others, masterGainDb: gain == null ? null : db(gain), masterResidualDb: residualDb, masterLagSamples: lag };
}

export const pass = (b) => (b == null ? 'n/a' : b ? 'PASS' : 'FAIL');
