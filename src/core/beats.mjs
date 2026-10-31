// Tempo and beat-grid detection for a steady-tempo music bed.
// Onset envelope = log spectral flux; tempo from its autocorrelation (weighted
// toward the BPM the bed was ordered at); period and phase refined by maximizing
// the envelope sampled on the grid; downbeat = grid slot with the strongest accents.

function fft(re, im) {
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
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

export function onsetEnvelope(mono, sr, { size = 1024, hop = 128 } = {}) {
  const win = new Float64Array(size).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  const bins = size / 2;
  const count = Math.max(0, Math.floor((mono.length - size) / hop) + 1);
  const env = new Float64Array(count);
  let prev = new Float64Array(bins);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let f = 0; f < count; f++) {
    for (let i = 0; i < size; i++) {
      re[i] = mono[f * hop + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    const cur = new Float64Array(bins);
    let flux = 0;
    for (let k = 1; k < bins; k++) {
      cur[k] = Math.log1p(1000 * Math.hypot(re[k], im[k]));
      const d = cur[k] - prev[k];
      if (d > 0) flux += d;
    }
    env[f] = f === 0 ? 0 : flux;
    prev = cur;
  }
  // Remove the slow trend so sustained loud passages do not dominate.
  const w = Math.round((0.4 * sr) / hop);
  const out = new Float64Array(count);
  let acc = 0;
  for (let i = 0; i < count; i++) {
    acc += env[i];
    if (i >= w) acc -= env[i - w];
    const mean = acc / Math.min(i + 1, w);
    out[i] = Math.max(0, env[i] - mean);
  }
  const max = out.reduce((a, b) => Math.max(a, b), 1e-12);
  for (let i = 0; i < count; i++) out[i] /= max;
  // Flux peaks when an onset reaches the window centre.
  return { env: out, rate: sr / hop, offset: size / 2 / sr };
}

function sampleAt(env, rate, t) {
  const x = t * rate;
  const i = Math.floor(x);
  if (i < 0 || i + 1 >= env.length) return 0;
  // Max over a ±1 hop neighbourhood keeps the score tolerant to sub-hop jitter.
  const a = env[i] + (env[i + 1] - env[i]) * (x - i);
  return Math.max(a, env[i - 1] ?? 0, env[i + 2] ?? 0) * 0.5 + a * 0.5;
}

export function detectBeats(mono, sr, { bpmHint = null, analyzeSeconds = 32 } = {}) {
  const { env, rate, offset } = onsetEnvelope(mono, sr);
  const span = Math.min(env.length, Math.round(analyzeSeconds * rate));

  // Coarse tempo: autocorrelation over 60..200 BPM, log-gaussian prior around the hint.
  let best = { score: -1, lag: 0 };
  const prior = bpmHint || 120;
  const ac = [];
  for (let lag = Math.floor((rate * 60) / 200); lag <= Math.ceil((rate * 60) / 60); lag++) {
    let s = 0;
    for (let i = 0; i + lag < span; i++) s += env[i] * env[i + lag];
    ac[lag] = s;
    const bpm = (60 * rate) / lag;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / prior) / (bpmHint ? 0.15 : 1), 2));
    if (s * w > best.score) best = { score: s * w, lag };
  }
  const coarse = (60 * rate) / best.lag;

  // Fine period + phase search.
  const evalGrid = (period, phase) => {
    let s = 0;
    let n = 0;
    for (let t = phase; t < span / rate; t += period, n++) s += sampleAt(env, rate, t);
    return n ? s / n : 0;
  };
  let fine = { score: -1 };
  for (let bpm = coarse * 0.97; bpm <= coarse * 1.03; bpm += 0.01) {
    const period = 60 / bpm;
    for (let phase = 0; phase < period; phase += 0.002) {
      const s = evalGrid(period, phase);
      if (s > fine.score) fine = { score: s, bpm, period, phase };
    }
  }
  const meanEnv = env.slice(0, span).reduce((a, b) => a + b, 0) / Math.max(1, span);

  // Downbeat: of the four grid slots, the one carrying the most onset energy.
  const slots = [0, 0, 0, 0];
  for (let k = 0, t = fine.phase; t < span / rate; t += fine.period, k++) slots[k % 4] += sampleAt(env, rate, t);
  const slot = slots.indexOf(Math.max(...slots));
  const downbeat = fine.phase + slot * fine.period;

  // How many grid beats have an onset peak within ±25 ms.
  let hits = 0;
  let total = 0;
  for (let t = fine.phase; t < span / rate; t += fine.period, total++) {
    const lo = Math.max(0, Math.floor((t - 0.025) * rate));
    const hi = Math.min(env.length - 1, Math.ceil((t + 0.025) * rate));
    let m = 0;
    for (let i = lo; i <= hi; i++) m = Math.max(m, env[i]);
    if (m > 2 * meanEnv) hits++;
  }

  return {
    bpm: fine.bpm,
    period: fine.period,
    firstBeat: fine.phase + offset,
    downbeat: downbeat + offset,
    downbeatSlot: slot,
    coarseBpm: coarse,
    gridContrast: fine.score / Math.max(1e-9, meanEnv),
    beatHitRatio: total ? hits / total : 0,
  };
}

// Tempo steadiness of a music take: the take is cut into windows (default 6 s, hop 3 s), the
// tempo is measured in each against the global grid, and the spread of those local tempos is
// returned (BPM standard deviation, lower = steadier) with the global hit ratio.
export function tempoSteadiness(mono, sr, grid, { window = 6, hop = 3 } = {}) {
  const local = [];
  for (let t = 0; t + window <= mono.length / sr; t += hop) {
    const part = mono.subarray(Math.round(t * sr), Math.round((t + window) * sr));
    const g = detectBeats(part, sr, { bpmHint: grid.bpm, analyzeSeconds: window });
    local.push(g.bpm);
  }
  const mean = local.reduce((a, b) => a + b, 0) / Math.max(1, local.length);
  const sd = Math.sqrt(local.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, local.length));
  return { localBpm: local, bpmStdDev: local.length ? sd : Infinity, hitRatio: grid.beatHitRatio };
}

export function monoOf(pcm, ch = 2) {
  const m = new Float32Array(pcm.length / ch);
  for (let i = 0; i < m.length; i++) {
    let s = 0;
    for (let c = 0; c < ch; c++) s += pcm[i * ch + c];
    m[i] = s / ch;
  }
  return m;
}
