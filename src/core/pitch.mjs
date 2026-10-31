import { decode } from './ff.mjs';

// Pitch movement at the end of a voice line, in semitones: the median pitch of the last third
// of the voiced frames against the middle third. Positive = the line ends rising (a question).
// Autocorrelation on 40 ms windows; the lowest lag within 12% of the best peak avoids octave-down
// errors, and every value is folded into the octave of the line's median so a voice break does
// not read as a jump.
export async function endPitchMove(file, { sr = 16000 } = {}) {
  const x = await decode(file, { sr, ch: 1 });
  const win = Math.round(0.04 * sr);
  const hop = Math.round(0.02 * sr);
  const minLag = Math.floor(sr / 700);
  const maxLag = Math.floor(sr / 80);
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const f0 = [];
  for (let s = 0; s + win + maxLag < x.length; s += hop) {
    let e = 0;
    for (let i = 0; i < win; i++) e += x[s + i] ** 2;
    if (Math.sqrt(e / win) < peak * 0.08) continue;
    const r = new Float32Array(maxLag + 2);
    let best = 0;
    let lag = 0;
    for (let L = minLag; L <= maxLag; L++) {
      let c = 0;
      let a = 0;
      let b = 0;
      for (let i = 0; i < win; i++) {
        c += x[s + i] * x[s + i + L];
        a += x[s + i] ** 2;
        b += x[s + i + L] ** 2;
      }
      r[L] = c / Math.sqrt(a * b + 1e-12);
      if (r[L] > best) ((best = r[L]), (lag = L));
    }
    if (best < 0.6) continue;
    for (let L = minLag + 1; L < lag; L++) {
      if (r[L] >= 0.88 * best && r[L] >= r[L - 1] && r[L] >= r[L + 1]) {
        lag = L;
        break;
      }
    }
    f0.push(sr / lag);
  }
  if (f0.length < 6) return null;
  const median = (a) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];
  const m = median(f0);
  const folded = f0.map((f) => {
    while (f > m * Math.SQRT2) f /= 2;
    while (f < m / Math.SQRT2) f *= 2;
    return f;
  });
  const n = folded.length;
  const mid = median(folded.slice(Math.floor(n / 3), Math.floor((2 * n) / 3)));
  const end = median(folded.slice(Math.floor((2 * n) / 3)));
  return 12 * Math.log2(end / mid);
}
