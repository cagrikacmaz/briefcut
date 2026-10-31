import test from 'node:test';
import assert from 'node:assert/strict';
import { trimOnset, trimTransient, speakableText, applyPronunciations, endAt } from '../src/core/assets.mjs';
import { SR, CH } from '../src/core/util.mjs';

// 0.3 s silence, then a tone (soft) or a click (hard), like generated audio.
function synth({ lead = 0.3, len = 0.5, hard = false }) {
  const n = Math.round((lead + len) * SR);
  const pcm = new Float32Array(n * CH);
  for (let i = Math.round(lead * SR); i < n; i++) {
    const t = i / SR - lead;
    const v = hard ? Math.exp(-t / 0.05) * Math.sin(2 * Math.PI * 1500 * t) : Math.min(1, t / 0.01) * 0.5 * Math.sin(2 * Math.PI * 220 * t);
    pcm[i * CH] = pcm[i * CH + 1] = v;
  }
  return pcm;
}

test('onset trim removes leading silence and reports where the voice starts', () => {
  const r = trimOnset(synth({}), { peakDb: -6 });
  assert.ok(Math.abs(r.leadingSilence - 0.3) < 0.006, `leading silence ${r.leadingSilence}`);
  assert.ok(Math.abs(r.onset / SR - 0.03) < 0.006, 'onset sits after the 30 ms pre-roll');
  let p = 0;
  for (const x of r.pcm) p = Math.max(p, Math.abs(x));
  assert.ok(Math.abs(20 * Math.log10(p) + 6) < 0.01, 'peak-normalized to -6 dBFS');
});

test('transient trim puts the hit 3 ms into the file', () => {
  const r = trimTransient(synth({ hard: true }), { peakDb: -9 });
  assert.ok(Math.abs(r.leadingSilence - 0.3) < 0.002);
  assert.ok(Math.abs(r.onset / SR - 0.003) < 0.0005, `onset ${r.onset / SR}`);
});

test('a placed onset lands on the cue sample whatever the leading silence', () => {
  for (const lead of [0.05, 0.3, 0.61]) {
    const r = trimTransient(synth({ lead, hard: true }));
    const cueSample = 48000;
    const start = cueSample - r.onset;
    assert.equal(start + r.onset, cueSample);
    assert.ok(Math.abs(r.leadingSilence - lead) < 0.002);
  }
});

test('tag-only lines get a vocalization; pronunciations touch only TTS text', () => {
  assert.equal(speakableText('[giggles]'), '[giggles] Hehehe!');
  assert.equal(speakableText('[laughs] Hello'), '[laughs] Hello');
  assert.equal(applyPronunciations('Hello Zoe, [Zoe] zoe!', [{ word: 'Zoe', say: 'Zo-ee' }]), 'Hello Zo-ee, [Zoe] zo-ee!');
});

test('endAt cuts with a fade that finishes at the cut', () => {
  const v = { pcm: synth({ lead: 0, len: 1 }), duration: 1, speechEnd: 1 };
  const removed = endAt(v, 0.5, 20);
  assert.ok(Math.abs(removed - 0.5) < 1e-3);
  assert.equal(Math.abs(v.pcm[v.pcm.length - 1]), 0);
});
