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
