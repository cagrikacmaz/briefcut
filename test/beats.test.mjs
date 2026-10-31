import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBeats, tempoSteadiness } from '../src/core/beats.mjs';
import { flashFrames } from '../src/core/autocues.mjs';
import { stripFrames } from '../src/core/strips.mjs';
import { parseDuration, globToRegExp } from '../src/core/util.mjs';

const SR = 22050;
function clicks(bpm, seconds, { lead = 0.3, drift = 0 } = {}) {
  const x = new Float32Array(Math.round((lead + seconds) * SR));
  let t = lead;
  let k = 0;
  while (t < lead + seconds) {
    const i = Math.round(t * SR);
    for (let j = 0; j < 400 && i + j < x.length; j++) x[i + j] += Math.exp(-j / 60) * (k % 4 === 0 ? 1 : 0.6) * Math.sin(j * 0.6);
    t += 60 / (bpm + drift * (t - lead));
    k++;
  }
  return x;
}

test('beat grid: tempo and first downbeat of a click track', () => {
  const g = detectBeats(clicks(120, 16), SR, { bpmHint: 120 });
  assert.ok(Math.abs(g.bpm - 120) < 0.5, `bpm ${g.bpm}`);
  const ph = (g.downbeat - 0.3) / 0.5;
  assert.ok(Math.abs(ph - Math.round(ph)) < 0.06, `downbeat ${g.downbeat} is on a beat`);
});

test('steadiness: a drifting take spreads more than a steady one', () => {
  const steady = clicks(120, 18);
  const drifting = clicks(112, 18, { drift: 1.2 });
  const a = tempoSteadiness(steady, SR, detectBeats(steady, SR, { bpmHint: 120 }));
  const b = tempoSteadiness(drifting, SR, detectBeats(drifting, SR, { bpmHint: 120 }));
  assert.ok(a.bpmStdDev < b.bpmStdDev, `${a.bpmStdDev} vs ${b.bpmStdDev}`);
});

test('helpers: flashes, strip frames, durations, globs', () => {
  assert.deepEqual(flashFrames([80, 80, 235, 80, 81, 236, 236, 80]), [2, 5]);
  assert.deepEqual(stripFrames(1.0, { clipFps: 24, stripFps: 8, window: 0.75 }).slice(0, 3), [6, 9, 12]);
  assert.equal(stripFrames(1.0, { clipFps: 24, stripFps: 24 }).length, 9);
  assert.equal(parseDuration('30m'), 1800000);
  assert.ok(globToRegExp('step_*').test('step_12'));
});
