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

export function renderMix({ totalSamples, voices = [], hits = [], music = null, ambience = null, levels, log }) {
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
  // Effects with duckDb are ducked under the voice bus with the music's key and timing; the
  // duck only lowers the level, so a ducked hit still starts on its sample.
  const ducked = new Map();
  for (const h of hits) {
    if (!h.duckDb) {
      addAt(A3, h.pcm, h.startSample, undb(h.gain || 0));
      continue;
    }
    const bus = ducked.get(h.duckDb) || new Float32Array(totalSamples * CH);
    addAt(bus, h.pcm, h.startSample, undb(h.gain || 0));
    ducked.set(h.duckDb, bus);
  }
  for (const [depthDb, bus] of ducked) {
    const d = duckCurve();
    for (let i = 0; i < totalSamples; i++) {
      const g = undb(-depthDb * d[i]);
      for (let c = 0; c < CH; c++) A3[i * CH + c] += bus[i * CH + c] * g;
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
  return { mix, stems: { A2, A3, A4, A5 }, ...report };
}
