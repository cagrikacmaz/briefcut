import test from 'node:test';
import assert from 'node:assert/strict';
import { applyVoiceRules, capFor } from '../src/core/voices.mjs';
import { assignVariants } from '../src/core/sfx.mjs';
import { SR, CH, nullLog } from '../src/core/util.mjs';

const R = { maxLeadDelay: 0.3, overlapGap: 0.15, supportOverlapDb: -3, supportNonVerbalCap: 1.2, supportVerbalCap: 1.5, leadSingleWordCap: 0.8, lineCaps: {}, capRetakes: 0, capFadeMs: 80, cutFadeMs: 20, gateDb: -32, maxOverlap: 0.15, maxLeadIn: null, maxSupportDelay: 0.3, maxInnerPause: null, keepPause: 0.3, fitLineToScene: true };
const cfg = { fps: 24, voiceRules: R, levels: { voicePeak: -6 } };
const store = { words: async () => null, retake: async () => { throw new Error('no retakes in this test'); } };

function voice(id, role, target, sec, voiceName = role) {
  const n = Math.round((0.03 + sec + 0.08) * SR);
  const pcm = new Float32Array(n * CH).fill(0.2);
  return { cue: { id, row: Number(id), role, voice: voiceName, text: 'a b', target, pictureTime: target, notes: [] }, pcm, onset: Math.round(0.03 * SR), duration: n / SR, speechEnd: (0.03 + sec) / 1, srcStart: 0 };
}

test('caps by role and line', () => {
  assert.equal(capFor({ role: 'support', nonVerbal: true, text: 'x' }, R), 1.2);
  assert.equal(capFor({ role: 'support', nonVerbal: false, text: 'x' }, R), 1.5);
  assert.equal(capFor({ role: 'lead', singleWord: true, text: 'x' }, R), 0.8);
  assert.equal(capFor({ role: 'lead', singleWord: false, text: 'x' }, R), null);
  assert.equal(capFor({ role: 'lead', text: 'Hi!' }, { ...R, lineCaps: { 'Hi!': 2 } }), 2);
});

test('a lead line waits for the previous lead line, at most 0.3 s, then the earlier one is cut', async () => {
  const a = voice('1', 'lead', 1.0, 1.0);
  const b = voice('2', 'lead', 2.0, 0.5);
  await applyVoiceRules([a, b], cfg, 10, store, nullLog());
  assert.ok(b.start - 2.0 <= 0.3 + 1e-9);
  assert.ok(a.end <= b.start - 0.15 + 1 / 24 + 1e-6, `earlier line ends before the later one starts (${a.end} vs ${b.start})`);
});

test('a protected window moves a line to its end', async () => {
  const a = voice('1', 'lead', 5.2, 0.6);
  await applyVoiceRules([a], cfg, 10, store, nullLog(), { protect: [{ from: 5.0, to: 6.5, label: 'the strike' }] });
  assert.equal(a.cue.timeline, 6.5);
});

test('a line that runs past its shot starts earlier, never before its floor, and reports the rest', async () => {
  const a = voice('1', 'lead', 8.0, 1.5);
  await applyVoiceRules([a], cfg, 12, store, nullLog(), { shotEnd: () => 9.0, floor: () => 7.8 });
  assert.ok(Math.abs(a.cue.timeline - 7.8) < 1e-9);
  assert.ok(a.runsOver > 0.3);
});

test('SFX variants rotate and never repeat back to back', () => {
  const variants = { tap: [{ variant: 1 }, { variant: 2 }, { variant: 3 }], hit: [{ variant: 1 }] };
  const hits = [0.1, 0.5, 0.9, 1.3, 1.7].map((t, i) => ({ id: String(i), sfxName: 'tap', timeline: t }));
  assignVariants(hits, variants);
  const seq = hits.map((h) => h.sfx.variant);
  assert.deepEqual(seq, [1, 2, 3, 1, 2]);
  for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1]);
});
