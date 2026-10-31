// Buses and their sum: A2 voices, A3 effects (and voices placed on A3), A4 music, A5 ambience.
// Every sound is added at a sample position computed from its cue; nothing here moves a sound.
import { SR, CH, undb, db } from './util.mjs';
import { rmsOf } from './assets.mjs';

export function addAt(bus, pcm, startSample, gain = 1) {
  const total = bus.length / CH;
  const n = pcm.length / CH;
  for (let i = 0; i < n; i++) {
    const j = startSample + i;
    if (j < 0 || j >= total) continue;
    for (let c = 0; c < CH; c++) bus[j * CH + c] += pcm[i * CH + c] * gain;
  }
}

// Duck amount 0..1 per sample, keyed from the summed voice bus: on while the bus's 10 ms RMS is
// above keyDb, held holdMs after it falls (no pumping between words), ramped over attack/release.
export function keyedDuck(total, key, { attackMs = 120, holdMs = 200, releaseMs = 450, duckKeyDb = -40 } = {}) {
  const d = new Float32Array(total);
  const w = Math.round(0.01 * SR);
  const thr = undb(duckKeyDb);
  const hold = Math.round((holdMs / 1000) * SR);
  const up = 1 / Math.max(1, Math.round((attackMs / 1000) * SR));
  const down = 1 / Math.max(1, Math.round((releaseMs / 1000) * SR));
  let lastOn = -Infinity;
  let cur = 0;
  for (let i0 = 0; i0 < total; i0 += w) {
    const i1 = Math.min(total, i0 + w);
    let s = 0;
    for (let i = i0; i < i1; i++) for (let c = 0; c < CH; c++) s += key[i * CH + c] ** 2;
    if (Math.sqrt(s / (CH * (i1 - i0))) >= thr) lastOn = i1;
    for (let i = i0; i < i1; i++) {
      cur = i <= lastOn + hold ? Math.min(1, cur + up) : Math.max(0, cur - down);
      d[i] = cur;
    }
  }
  return d;
}

// Lays a music file on the timeline with its first downbeat (offsetSamples) on `beatOneAt`,
// loops it from that downbeat if the film is longer, and ends it at `stopAt` seconds with a
// fadeMs fade that finishes there + fadeMs (hard stop), or fades over `fadeOut` at the film end.
export function layMusic(total, pcm, { offsetSamples = 0, beatOneAt = 0, stopAt = null, stopFadeMs = 20, fadeOut = 0 } = {}) {
  const out = new Float32Array(total * CH);
  const frames = pcm.length / CH;
  const startTl = Math.round(beatOneAt * SR);
  let looped = false;
  for (let i = startTl; i < total; i++) {
    let src = offsetSamples + (i - startTl);
    if (src >= frames) {
      src = offsetSamples + ((src - offsetSamples) % Math.max(1, frames - offsetSamples));
      looped = true;
    }
    for (let c = 0; c < CH; c++) out[i * CH + c] = pcm[src * CH + c] || 0;
  }
  let end = total;
  if (stopAt != null) {
    const s0 = Math.round(stopAt * SR);
    const fadeN = Math.max(1, Math.round((stopFadeMs / 1000) * SR));
    for (let i = s0; i < total; i++) {
      const g = i < s0 + fadeN ? 1 - (i - s0) / fadeN : 0;
      for (let c = 0; c < CH; c++) out[i * CH + c] *= g;
    }
    end = Math.min(total, s0 + fadeN);
  } else if (fadeOut > 0) {
    const n = Math.round(fadeOut * SR);
    for (let i = Math.max(0, total - n); i < total; i++) for (let c = 0; c < CH; c++) out[i * CH + c] *= (total - i) / n;
  }
  return { pcm: out, playing: [startTl, end], looped };
}

export function renderMix({ totalSamples, voices = [], hits = [], music = null, ambience = null, levels, log, stemsFor = [] }) {
  const A2 = new Float32Array(totalSamples * CH);
  const A3 = new Float32Array(totalSamples * CH);
  const A4 = new Float32Array(totalSamples * CH);
  const A5 = new Float32Array(totalSamples * CH);
  const key = new Float32Array(totalSamples * CH);
  for (const v of voices) {
    addAt(v.bus === 'A3' ? A3 : A2, v.pcm, v.startSample);
    if (!v.noDuck) addAt(key, v.pcm, v.startSample);
  }
  let duck = null;
  const duckCurve = () => (duck ??= keyedDuck(totalSamples, key, levels));
  // Effects with a duck ({ db, attackMs, releaseMs }, or duckDb) are ducked under the voice bus,
  // keyed like the music, with their own timing when given; the duck only lowers the level, so a
  // ducked hit still starts on its sample. `stemsFor` names effects whose contribution, as mixed,
  // is returned in sfxStems (for QA).
  const want = new Set(stemsFor);
  const sfxStems = {};
  const stemOf = (name) => (sfxStems[name] ??= new Float32Array(totalSamples * CH));
  const ducked = new Map();
  for (const h of hits) {
    const d = h.duck || (h.duckDb ? { db: h.duckDb } : null);
    if (!d) {
      addAt(A3, h.pcm, h.startSample, undb(h.gain || 0));
      if (want.has(h.sfxName)) addAt(stemOf(h.sfxName), h.pcm, h.startSample, undb(h.gain || 0));
      continue;
    }
    const k = `${d.db}|${d.attackMs ?? ''}|${d.releaseMs ?? ''}|${d.band ? `${d.band.extraDb}@${d.band.lo}-${d.band.hi}` : ''}`;
    const g = ducked.get(k) || { d, bus: new Float32Array(totalSamples * CH), names: new Map() };
    addAt(g.bus, h.pcm, h.startSample, undb(h.gain || 0));
    if (want.has(h.sfxName)) {
      if (!g.names.has(h.sfxName)) g.names.set(h.sfxName, new Float32Array(totalSamples * CH));
      addAt(g.names.get(h.sfxName), h.pcm, h.startSample, undb(h.gain || 0));
    }
    ducked.set(k, g);
  }
  for (const { d, bus, names } of ducked.values()) {
    // Own timing, hold and key threshold when the brief gives them; else the music duck's.
    const timing = { ...(d.attackMs != null ? { attackMs: d.attackMs } : {}), ...(d.releaseMs != null ? { releaseMs: d.releaseMs } : {}), ...(d.holdMs != null ? { holdMs: d.holdMs } : {}), ...(d.keyDb != null ? { duckKeyDb: d.keyDb } : {}) };
    const curve = Object.keys(timing).length ? keyedDuck(totalSamples, key, { ...levels, ...timing }) : duckCurve();
    // Optional deeper duck in one band (the speech band): out = g * bus - (g - gb) * band, which is
    // exactly the bus when the duck is off, and leaves the rest of the spectrum at the broadband duck.
    // The band's extra depth may have its own release, so the band comes back as soon as the line ends.
    const band = d.band ? { pcm: bandPassZeroPhase(bus, d.band.lo, d.band.hi), names: new Map([...names].map(([n, nb]) => [n, bandPassZeroPhase(nb, d.band.lo, d.band.hi)])) } : null;
    const bandOwn = { ...(d.band?.attackMs != null ? { attackMs: d.band.attackMs } : {}), ...(d.band?.releaseMs != null ? { releaseMs: d.band.releaseMs } : {}) };
    const bandCurve = Object.keys(bandOwn).length ? keyedDuck(totalSamples, key, { ...levels, ...timing, ...bandOwn }) : curve;
    for (let i = 0; i < totalSamples; i++) {
      const g = undb(-d.db * curve[i]);
      const gb = band ? undb(-(d.db * curve[i] + d.band.extraDb * bandCurve[i])) : g;
      for (let c = 0; c < CH; c++) {
        const j = i * CH + c;
        A3[j] += bus[j] * g - (band ? (g - gb) * band.pcm[j] : 0);
        for (const [name, nb] of names) stemOf(name)[j] += nb[j] * g - (band ? (g - gb) * band.names.get(name)[j] : 0);
      }
    }
  }

  const report = {};
  if (music) {
    const laid = layMusic(totalSamples, music.pcm, music);
    if (laid.looped) log?.warn('music is shorter than the film: looped from its first downbeat');
    // RMS level measured where the music plays (before the hard stop), not over the whole film.
    const [a, b] = laid.playing;
    const gain = undb(levels.musicRms) / Math.max(1e-9, rmsOf(laid.pcm, a, Math.max(a + 1, b)));
    const duck = duckCurve();
    const depth = Math.min(levels.duckDb, levels.duckMaxDb ?? 6);
    for (let i = 0; i < totalSamples; i++) {
      const g = gain * undb(-depth * duck[i]);
      for (let c = 0; c < CH; c++) A4[i * CH + c] = laid.pcm[i * CH + c] * g;
    }
    let duckMax = 0;
    for (let i = 0; i < duck.length; i++) if (duck[i] > duckMax) duckMax = duck[i];
    Object.assign(report, { musicGainDb: db(gain), duckDepthDb: depth, musicPlaying: [a / SR, b / SR], duckMax });
  }
  if (ambience) {
    const n = ambience.pcm.length / CH;
    for (let i = 0; i < totalSamples; i++) {
      const src = i % n;
      for (let c = 0; c < CH; c++) A5[i * CH + c] = ambience.pcm[src * CH + c];
    }
    if (n < totalSamples) log?.info(`ambience (${(n / SR).toFixed(1)} s) looped under the ${(totalSamples / SR).toFixed(1)} s film`);
    const gain = undb(levels.ambienceRms) / Math.max(1e-9, rmsOf(A5));
    const fadeN = Math.round((ambience.fadeOut || 0) * SR);
    const fadeIn = Math.round(0.01 * SR);
    for (let i = 0; i < totalSamples; i++) {
      let g = gain;
      if (fadeN && i >= totalSamples - fadeN) g *= (totalSamples - i) / fadeN;
      if (i < fadeIn) g *= i / fadeIn;
      for (let c = 0; c < CH; c++) A5[i * CH + c] *= g;
    }
    report.ambienceGainDb = db(gain);
  }
  const mix = new Float32Array(totalSamples * CH);
  for (let i = 0; i < mix.length; i++) mix[i] = A2[i] + A3[i] + A4[i] + A5[i];
  return { mix, stems: { A2, A3, A4, A5 }, sfxStems, ...report };
}

// RBJ biquads on interleaved stereo: a low shelf for voice colour, and the high- and low-pass
// edges QA uses to measure a band.
function biquad(pcm, [b0, b1, b2, a0, a1, a2]) {
  const out = new Float32Array(pcm.length);
  const n = pcm.length / CH;
  for (let c = 0; c < CH; c++) {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < n; i++) {
      const x = pcm[i * CH + c];
      const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      out[i * CH + c] = y;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
    }
  }
  return out;
}

export function lowShelf(pcm, freq, gainDb, sr = SR) {
  const A = 10 ** (gainDb / 40);
  const w = (2 * Math.PI * freq) / sr;
  const alpha = (Math.sin(w) / 2) * Math.SQRT2;
  const cw = Math.cos(w);
  const s = 2 * Math.sqrt(A) * alpha;
  return biquad(pcm, [A * (A + 1 - (A - 1) * cw + s), 2 * A * (A - 1 - (A + 1) * cw), A * (A + 1 - (A - 1) * cw - s), A + 1 + (A - 1) * cw + s, -2 * (A - 1 + (A + 1) * cw), A + 1 + (A - 1) * cw - s]);
}

function pass(pcm, freq, high, sr = SR) {
  const w = (2 * Math.PI * freq) / sr;
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const cw = Math.cos(w);
  const b = high ? [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2] : [(1 - cw) / 2, 1 - cw, (1 - cw) / 2];
  return biquad(pcm, [...b, 1 + alpha, -2 * cw, 1 - alpha]);
}

// Band-limited copy: two high-pass and two low-pass stages (24 dB per octave at each edge).
export function bandPass(pcm, lo, hi, sr = SR) {
  return pass(pass(pass(pass(pcm, lo, true, sr), lo, true, sr), hi, false, sr), hi, false, sr);
}

// Zero-phase band (the band filter run forward, then over the reversed signal): subtracting it
// from the original removes the band without the phase smear a one-way filter leaves.
export function bandPassZeroPhase(pcm, lo, hi, sr = SR) {
  const rev = (p) => {
    const out = new Float32Array(p.length);
    const n = p.length / CH;
    for (let i = 0; i < n; i++) for (let c = 0; c < CH; c++) out[i * CH + c] = p[(n - 1 - i) * CH + c];
    return out;
  };
  return rev(bandPass(rev(bandPass(pcm, lo, hi, sr)), lo, hi, sr));
}

// Feed-forward compressor on interleaved stereo, linked: a 5 ms RMS detector, gain reduction
// above thresholdDb at `ratio`, smoothed with attack/release. The caller sets the level after.
export function compress(pcm, { thresholdDb = -24, ratio = 3, attackMs = 5, releaseMs = 120 } = {}, sr = SR) {
  const n = pcm.length / CH;
  const out = new Float32Array(pcm.length);
  const w = Math.max(1, Math.round(0.005 * sr));
  const a = Math.exp(-1 / ((attackMs / 1000) * sr));
  const r = Math.exp(-1 / ((releaseMs / 1000) * sr));
  let sum = 0;
  let grDb = 0;
  for (let i = 0; i < n; i++) {
    const x = (pcm[i * CH] ** 2 + pcm[i * CH + 1] ** 2) / 2;
    sum += x;
    if (i >= w) sum -= (pcm[(i - w) * CH] ** 2 + pcm[(i - w) * CH + 1] ** 2) / 2;
    const lvl = 10 * Math.log10(Math.max(sum, 0) / Math.min(i + 1, w) + 1e-20);
    const want = lvl > thresholdDb ? (lvl - thresholdDb) * (1 - 1 / ratio) : 0;
    grDb = want > grDb ? a * grDb + (1 - a) * want : r * grDb + (1 - r) * want;
    const g = 10 ** (-grDb / 20);
    out[i * CH] = pcm[i * CH] * g;
    out[i * CH + 1] = pcm[i * CH + 1] * g;
  }
  return out;
}
