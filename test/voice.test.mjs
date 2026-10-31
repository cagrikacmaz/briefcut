// Narrator treatment: the audition measures (fundamental, centroid) and pick, the speech-band duck
// that leaves the bus untouched when off, the compressor, the low shelf and the speech-band ratio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceStats, pickVoice } from '../src/core/audition.mjs';
import { renderMix, compress, lowShelf, bandPass } from '../src/core/mix.mjs';
import { speechBandRatio } from '../src/core/qa.mjs';
import { parseBrief } from '../src/core/brief.mjs';
import { SR, CH, nullLog } from '../src/core/util.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const hello = fs.readFileSync(path.join(ROOT, 'examples', 'hello-short', 'BRIEF.md'), 'utf8');

// A buzzy vowel: harmonics of f0 with a 1/k roll-off, `bright` tilting energy up.
const vowel = (f0, sec = 0.8, bright = 1) => {
  const n = Math.round(sec * SR);
  const p = new Float32Array(n * CH);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let k = 1; k * f0 < 6000; k++) v += Math.sin((2 * Math.PI * k * f0 * i) / SR) / k ** (1.4 / bright);
    p[i * CH] = p[i * CH + 1] = 0.2 * v;
  }
  return p;
};
const tone = (f, sec, a = 0.3) => {
  const n = Math.round(sec * SR);
  const p = new Float32Array(n * CH);
  for (let i = 0; i < n; i++) p[i * CH] = p[i * CH + 1] = a * Math.sin((2 * Math.PI * f * i) / SR);
  return p;
};
const rmsDb = (p, a = 0, b = p.length / CH) => {
  let s = 0;
  for (let i = a; i < b; i++) s += p[i * CH] ** 2;
  return 10 * Math.log10(s / (b - a));
};

test('audition: fundamental and centroid are measured, the lowest and fullest voice wins', () => {
  const low = voiceStats(vowel(95));
  const high = voiceStats(vowel(150, 0.8, 1.6));
  assert.ok(Math.abs(low.f0 - 95) < 3, `f0 ${low.f0}`);
  assert.ok(Math.abs(high.f0 - 150) < 4, `f0 ${high.f0}`);
  assert.ok(low.centroid < high.centroid);
  const pick = pickVoice([{ asked: 'B', ...high }, { asked: 'A', ...low }, { asked: 'C', missing: true }]);
  assert.equal(pick.asked, 'A');
});

test('speech-band duck: the band drops by its extra depth under a voice, the rest by the broadband depth', () => {
  const total = 2 * SR;
  const low = tone(120, 2);
  const mid = tone(1000, 2);
  const bell = new Float32Array(low.length);
  for (let i = 0; i < bell.length; i++) bell[i] = low[i] + mid[i];
  const voice = tone(200, 0.8, 0.5);
  const levels = { duckDb: 4, duckMaxDb: 6, attackMs: 20, holdMs: 0, releaseMs: 50, duckKeyDb: -40 };
  const res = renderMix({ totalSamples: total, voices: [{ pcm: voice, startSample: Math.round(0.6 * SR) }], hits: [{ pcm: bell, startSample: 0, sfxName: 'bell', duck: { db: 6, band: { extraDb: 12, lo: 300, hi: 3000 } } }], levels, stemsFor: ['bell'] });
  const s = res.sfxStems.bell;
  const at = (pcm, t) => [Math.round(t * SR), Math.round((t + 0.2) * SR)];
  const [a, b] = at(s, 1.0);
  const lowDrop = rmsDb(bandPass(bell, 60, 200), a, b) - rmsDb(bandPass(s, 60, 200), a, b);
  const midDrop = rmsDb(bandPass(bell, 600, 1600), a, b) - rmsDb(bandPass(s, 600, 1600), a, b);
  assert.ok(Math.abs(lowDrop - 6) < 1.2, `low band ducked ${lowDrop.toFixed(2)} dB`);
  assert.ok(Math.abs(midDrop - 18) < 1.5, `speech band ducked ${midDrop.toFixed(2)} dB`);
  const [c, d] = at(s, 0.2);
  assert.ok(Math.abs(rmsDb(s, c, d) - rmsDb(bell, c, d)) < 0.05, 'untouched before the voice');
});

test('compressor evens a line out; low shelf lifts the lows only', () => {
  const loud = tone(300, 0.5, 0.5);
  const quiet = tone(300, 0.5, 0.05);
  const line = new Float32Array(loud.length + quiet.length);
  line.set(loud, 0);
  line.set(quiet, loud.length);
  const out = compress(line, { thresholdDb: -30, ratio: 6, attackMs: 5, releaseMs: 80 });
  const n = loud.length / CH;
  const before = rmsDb(line, 0, n) - rmsDb(line, n, 2 * n);
  const after = rmsDb(out, Math.round(0.1 * SR), n) - rmsDb(out, n + Math.round(0.1 * SR), 2 * n);
  assert.ok(after < before - 10, `spread ${before.toFixed(1)} -> ${after.toFixed(1)} dB`);
  const lowGain = rmsDb(lowShelf(tone(60, 1), 150, 2)) - rmsDb(tone(60, 1));
  const highGain = rmsDb(lowShelf(tone(3000, 1), 150, 2)) - rmsDb(tone(3000, 1));
  assert.ok(Math.abs(lowGain - 2) < 0.3 && Math.abs(highGain) < 0.2, `shelf ${lowGain.toFixed(2)} / ${highGain.toFixed(2)} dB`);
});

test('speech-band ratio: voice over effect in the line window, band-limited', () => {
  const v = tone(1000, 2, 0.2);
  const e = tone(1000, 2, 0.1);
  const r = speechBandRatio(v, e, 0.5, 1.5);
  assert.ok(Math.abs(r.ratioDb - 6.02) < 0.2, `${r.ratioDb}`);
  assert.ok(speechBandRatio(v, tone(80, 2, 0.5), 0.5, 1.5).ratioDb > 20, 'a low effect barely masks the speech band');
});

test('brief: voice by audition, low shelf, compressor, duck timing and band, speech-band QA', () => {
  const text = hello
    .replace(/(## Mix levels[^\n]*\n)/, '$1Narrator low shelf +2 dB at 150 Hz.\n\nNarrator compressed 6:1 above -30 dBFS (5 ms attack, 80 ms release).\n\nboom ducked 6 dB under the narrator (150 ms attack, 600 ms release, 40 ms hold, key -24 dBFS), 18 dB more in the speech band 300-3000 Hz (20 ms attack, 60 ms release).\n\n')
    .replace(/## QA\r?\n/, '## QA\n13. The narrator reads over the boom on a phone speaker: speech band 300-3000 Hz of the line at least 6 dB above the strike in the line\'s window.\n')
    .replace(/Narrator voice by name[^\r\n]*/, 'Narrator voice by audition, lowest and fullest: `Daniel`, `Adam`.');
  const cfg = parseBrief(text, 'BRIEF.md', nullLog());
  assert.deepEqual(cfg.levels.voiceShelf.narrator, { gainDb: 2, freq: 150 });
  assert.deepEqual(cfg.levels.voiceComp.narrator, { ratio: 6, thresholdDb: -30, attackMs: 5, releaseMs: 80 });
  assert.deepEqual(cfg.levels.sfxDuck.boom, { db: 6, attackMs: 150, releaseMs: 600, holdMs: 40, keyDb: -24, band: { extraDb: 18, lo: 300, hi: 3000, attackMs: 20, releaseMs: 60 } });
  assert.deepEqual(cfg.qa.speechBand, { role: 'narrator', sfx: 'boom', lo: 300, hi: 3000, minDb: 6 });
  assert.equal(cfg.tts.roles.narrator.audition, true);
  assert.deepEqual(cfg.tts.roles.narrator.candidates, ['Daniel', 'Adam']);
});
