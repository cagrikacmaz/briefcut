import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSongBlock } from '../src/core/qa.mjs';
import { CH } from '../src/core/util.mjs';

const song = Float32Array.from({ length: 4800 * CH }, (_, i) => Math.sin(i / 7) * 0.4);

test('song block: premix equal to the song sample for sample passes', () => {
  const premix = new Float32Array(20000 * CH);
  premix.set(song, 1000 * CH);
  const other = new Float32Array(premix.length);
  const master = Float32Array.from(premix, (x) => x * 0.8);
  const r = checkSongBlock(premix, [other], song, 1000, 4800, master);
  assert.equal(r.exact, true);
  assert.equal(r.otherTrackSamples, 0);
  assert.ok(Math.abs(r.masterGainDb - 20 * Math.log10(0.8)) < 1e-6);
  assert.ok(r.masterResidualDb < -100);
});

test('song block: one changed sample or another track inside the block fails', () => {
  const premix = new Float32Array(20000 * CH);
  premix.set(song, 1000 * CH);
  premix[(1000 + 10) * CH] += 1e-4;
  const other = new Float32Array(premix.length);
  other[(1000 + 20) * CH] = 0.1;
  const r = checkSongBlock(premix, [other], song, 1000, 4800);
  assert.equal(r.exact, false);
  assert.equal(r.firstDiffSample, 10);
  assert.equal(r.otherTrackSamples, 1);
});
