import test from 'node:test';
import assert from 'node:assert/strict';
import { layMusic, keyedDuck, renderMix } from '../src/core/mix.mjs';
import { gainToTarget, loudnessOk } from '../src/core/master.mjs';
import { parseR128Summary, parseLoudnormJson } from '../src/core/ff.mjs';
import { peakAfter } from '../src/core/qa.mjs';
import { SR, CH, db } from '../src/core/util.mjs';

const tone = (sec, a = 0.5) => {
  const n = Math.round(sec * SR);
  const p = new Float32Array(n * CH);
  for (let i = 0; i < n; i++) p[i * CH] = p[i * CH + 1] = a * Math.sin((2 * Math.PI * 330 * i) / SR);
  return p;
};

test('music hard stop: silent from the stop + fade, downbeat on beat-one time', () => {
  const total = 3 * SR;
  const m = layMusic(total, tone(4), { offsetSamples: Math.round(0.2 * SR), beatOneAt: 0, stopAt: 1.5, stopFadeMs: 20 });
  assert.equal(peakAfter(m.pcm, 1.52), -240);
  assert.ok(db(Math.abs(m.pcm[Math.round(1.0 * SR) * CH])) > -20 || db(Math.abs(m.pcm[(Math.round(1.0 * SR) + 7) * CH])) > -20);
  assert.deepEqual(m.playing, [0, Math.round(1.5 * SR) + Math.round(0.02 * SR)]);
});

test('music RMS is set where it plays, not over the silent tail', () => {
  const total = 4 * SR;
  const r = renderMix({ totalSamples: total, music: { pcm: tone(5), offsetSamples: 0, stopAt: 2, stopFadeMs: 20 }, levels: { musicRms: -21, duckDb: 4, duckMaxDb: 6 } });
  let s = 0;
  const end = 2 * SR;
  for (let i = 0; i < end * CH; i++) s += r.stems.A4[i] ** 2;
  assert.ok(Math.abs(db(Math.sqrt(s / (end * CH))) + 21) < 0.2);
});

test('keyed duck ramps in under a voice and releases after hold', () => {
  const total = 3 * SR;
  const key = new Float32Array(total * CH);
  key.set(tone(1, 0.3), SR * CH);
  const d = keyedDuck(total, key, { attackMs: 120, holdMs: 200, releaseMs: 450, duckKeyDb: -40 });
  assert.equal(d[Math.round(0.5 * SR)], 0);
  assert.ok(d[Math.round(1.5 * SR)] > 0.99);
  assert.ok(d[Math.round(2.9 * SR)] < 0.01);
});

test('loudness math and meter parsing', () => {
  assert.equal(gainToTarget(-14, -18.5), 4.5);
  assert.ok(loudnessOk({ I: -14.3, TP: -1.2 }, { I: -14, TP: -1, tolerance: 0.5 }));
  assert.ok(!loudnessOk({ I: -14.3, TP: -0.9 }, { I: -14, TP: -1, tolerance: 0.5 }));
  assert.ok(!loudnessOk({ I: -13.4, TP: -2 }, { I: -14, TP: -1, tolerance: 0.5 }));
  const s = parseR128Summary('...\nSummary:\n\n  Integrated loudness:\n    I:         -14.0 LUFS\n    Threshold: -24.4 LUFS\n\n  Loudness range:\n    LRA:         6.2 LU\n\n  True peak:\n    Peak:       -1.4 dBFS\n');
  assert.deepEqual(s, { I: -14, LRA: 6.2, TP: -1.4 });
  assert.equal(parseLoudnormJson('x\n{\n "input_i" : "-18.29",\n "normalization_type" : "linear"\n}\n').input_i, '-18.29');
});

test('decay hold: the tail falls no faster than the rate, the attack and peak are untouched, lift is capped', async () => {
  const { holdDecay } = await import('../src/core/sfx.mjs');
  // A bell-like take: 10 ms attack, then 10 dB/s exponential decay over 6 s.
  const n = 6 * SR;
  const p = new Float32Array(n * CH);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = t < 0.01 ? t / 0.01 : 10 ** ((-10 * (t - 0.01)) / 20);
    p[i * CH] = p[i * CH + 1] = 0.5 * env * Math.sin(2 * Math.PI * 220 * t);
  }
  const out = holdDecay(p, { rate: 1.5, from: 0.5, maxLift: 30 });
  const rmsDb = (x, t0, t1) => {
    let s = 0;
    for (let i = Math.round(t0 * SR); i < Math.round(t1 * SR); i++) s += x[i * CH] ** 2;
    return 10 * Math.log10(s / (Math.round(t1 * SR) - Math.round(t0 * SR)));
  };
  assert.equal(out[Math.round(0.01 * SR) * CH], p[Math.round(0.01 * SR) * CH]);
  const ref = rmsDb(out, 0.5, 0.6);
  for (const t of [1.5, 2.5, 3.0]) assert.ok(rmsDb(out, t, t + 0.1) >= ref - 1.5 * (t - 0.5) - 0.6, `held at ${t} s`);
  // Natural decay at 4.5 s is 45 dB down; the lift stops at 30 dB, so the tail still falls there.
  assert.ok(rmsDb(out, 5.5, 5.6) < ref - 1.5 * 5 - 3, 'lift capped');
  assert.ok(rmsDb(out, 5.5, 5.6) - rmsDb(p, 5.5, 5.6) <= 30.5, 'at most 30 dB of lift');
});

test('an effect with duckDb is ducked under the voices; a hit gain is applied on its own sample', () => {
  const total = 2 * SR;
  const bell = tone(2, 0.25);
  const voice = tone(0.5, 0.5);
  const res = renderMix({ totalSamples: total, voices: [{ pcm: voice, startSample: Math.round(0.5 * SR) }], hits: [{ pcm: bell, startSample: 0, duckDb: 6 }], levels: { duckDb: 4, duckMaxDb: 6, attackMs: 120, holdMs: 200, releaseMs: 450, duckKeyDb: -40 } });
  const at = (pcm, t) => {
    let s = 0;
    for (let i = Math.round(t * SR); i < Math.round((t + 0.05) * SR); i++) s += pcm[i * CH] ** 2;
    return 10 * Math.log10(s / Math.round(0.05 * SR));
  };
  assert.ok(Math.abs(at(res.stems.A3, 0.2) - at(bell, 0.2)) < 0.1, 'not ducked before the voice');
  assert.ok(at(bell, 0.85) - at(res.stems.A3, 0.85) > 5.5, 'ducked about 6 dB while the voice plays');
  const g = renderMix({ totalSamples: total, hits: [{ pcm: bell, startSample: 100, gain: -6 }], levels: { duckDb: 4 } });
  assert.ok(Math.abs(g.stems.A3[(100 + 500) * CH] - bell[500 * CH] * 10 ** (-6 / 20)) < 1e-6);
  assert.equal(g.stems.A3[50 * CH], 0);
});

test('tail loudness: lowest momentary value in the window against the strike reference', async () => {
  const { tailLoudness } = await import('../src/core/qa.mjs');
  const series = [];
  for (let t = 0.1; t <= 10; t += 0.1) series.push({ t: Math.round(t * 10) / 10, M: t < 5 ? -30 : t < 5.5 ? -8 : -8 - (t - 5.5) * 2 });
  const ok = tailLoudness(series, { from: 6, to: 9, refAt: 5, lu: 8 });
  assert.equal(ok.ref.M, -8);
  assert.ok(Math.abs(ok.low.M - (-15)) < 1e-6 && Math.abs(ok.low.t - 9) < 1e-6);
  assert.equal(ok.ok, true);
  assert.equal(tailLoudness(series, { from: 6, to: 9, refAt: 5, lu: 6 }).ok, false);
});
