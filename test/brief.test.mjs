import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBrief, clipKey, parseEventList, parseTables, applyFixes } from '../src/core/brief.mjs';
import { nullLog } from '../src/core/util.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const hello = fs.readFileSync(path.join(ROOT, 'examples', 'hello-short', 'BRIEF.md'), 'utf8');
const fixture = fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'showcase_brief.md'), 'utf8');

test('clip keys match EDL rows, map rows and files', () => {
  assert.equal(clipKey('S1_HAMMER'), 'S1');
  assert.equal(clipKey('s12 take b'), 'S12');
  assert.equal(clipKey('END_CARD'), 'END_CARD');
});

test('event lists: names, wildcards, "clip start", parentheses dropped', () => {
  assert.deepEqual(parseEventList('tap_1, tap_2, tap_3'), ['tap_1', 'tap_2', 'tap_3']);
  assert.deepEqual(parseEventList('step_* (every one)'), ['step_*']);
  assert.deepEqual(parseEventList('clip start'), ['start']);
});

test('tables keep pipes inside backticks', () => {
  const t = parseTables('| A | B |\n|---|---|\n| `x | y` | 2 |\n');
  assert.equal(t[0].rows[0].a, '`x | y`');
});

test('showcase-shaped brief: format, rules, tables, levels, end card, export', () => {
  const cfg = parseBrief(fixture, 'CLOCK_BRIEF.md', nullLog());
  assert.equal(cfg.id, 'CLOCK');
  assert.deepEqual([cfg.width, cfg.height, cfg.fps], [1080, 1920, 24]);
  assert.deepEqual(cfg.durationQa, [15, 20]);
  assert.equal(cfg.shotRules.minShot, 2.0);
  assert.equal(cfg.shotRules.minDeadCut, 0.75);
  assert.deepEqual(cfg.firstEvent, { seconds: 0.5, event: 'tap_1' });
  assert.equal(cfg.edl.length, 3);
  assert.equal(cfg.edl[2].kind, 'card');
  assert.equal(cfg.endCard.seconds, 1.75);
  assert.equal(cfg.sfx.hammer_tap.variants, 3);
  assert.equal(cfg.sfx.call.trim, 'onset');
  const narr = cfg.tts.roles.narrator;
  assert.equal(narr.model, 'eleven_multilingual_v2');
  assert.equal(narr.settings.speed, 0.9);
  assert.equal(narr.settings.stability, 0.55);
  assert.deepEqual(narr.candidates, ['VoiceA', 'VoiceB', 'VoiceC']);
  const tapRow = cfg.cues.find((c) => c.sfxName === 'hammer_tap');
  assert.deepEqual(tapRow.events, ['tap_1', 'tap_2', 'tap_3']);
  assert.equal(cfg.cues.find((c) => c.sfxName === 'call').offset, -0.05);
  assert.equal(cfg.music.takes, 2);
  assert.equal(cfg.music.bpm, 120);
  assert.equal(cfg.music.beatOneAt, 0);
  assert.deepEqual(cfg.music.hardStop, { event: 'strike', fadeMs: 20 });
  assert.equal(cfg.ambience.fadeOut, 1.0);
  assert.equal(cfg.levels.ambienceRms, -30);
  assert.equal(cfg.levels.sfxPeakByName.big_strike, -4);
  assert.equal(cfg.levels.musicRms, -21);
  assert.deepEqual(cfg.protect, [{ sfx: 'big_strike', seconds: 1.5 }]);
  assert.equal(cfg.export.master, 'CLOCK_master.mp4');
  assert.equal(cfg.export.wide, 'CLOCK_16x9.mp4');
  assert.equal(cfg.qa.loudestSfx, 'big_strike');
  assert.equal(cfg.endCard.lines[1].opacity, 0.6);
});

test('demo brief parses with scenes, mock providers and clip length', () => {
  const cfg = parseBrief(hello, 'BRIEF.md', nullLog());
  assert.equal(cfg.video.provider, 'mock');
  assert.equal(cfg.tts.provider, 'mock');
  assert.equal(cfg.clipSeconds, 3);
  assert.equal(cfg.scenes.length, 3);
  assert.equal(cfg.export.x264Preset, 'veryfast');
});

test('one video model per film: a scene with its own model is refused', () => {
  const text = hello.replace('- Mock events: boom=10', '- Mock events: boom=10\n- Model: some-other-model');
  assert.throws(() => parseBrief(text, 'BRIEF.md', nullLog()), /one video model per film/);
});

test('an audio-map SFX that is not in the SFX table is an error', () => {
  const text = hello.replace('| S3_RED | A3 | sfx:boom |', '| S3_RED | A3 | sfx:nope |');
  assert.throws(() => parseBrief(text, 'BRIEF.md', nullLog()), /sfx:nope is not in the SFX table/);
});

test('FIX passes replace whole sections by heading; later passes win; new sections are appended', () => {
  const base = '# X\n\n## Goal\nA 9:16 film.\n\n## End card (black)\n1.75 s black.\n\n## Export\nold\n';
  const { text, applied } = applyFixes(base, [
    { name: 'X_FIX01.md', text: '# note\nchanges below\n\n## End card\n1.5 s black.\n\n## Export\nfirst\n' },
    { name: 'X_FIX02.md', text: '## Export\nsecond\n\n## Notes\nnew\n' },
  ]);
  assert.match(text, /## End card \(black\)\n1\.5 s black\./);
  assert.match(text, /## Export\nsecond/);
  assert.doesNotMatch(text, /first|old|1\.75|changes below/);
  assert.match(text, /## Goal\nA 9:16 film\./);
  assert.match(text, /## Notes\nnew/);
  assert.equal(applied.length, 4);
});

test('revision options: row gain, decay hold, effect duck, end-card size, tail QA', () => {
  const text = hello
    .replace(/## Mix levels[^\n]*\n/, (h) => `${h}boom decay held to 1.2 dB/s from 0.5 s after its attack (lift at most 36 dB).\n\nboom ducked 4 dB under the narrator.\n\n`)
    .replace(/## QA\r?\n/, '## QA\n12. The last 3 s before the end card stay within 8 LU of the boom (momentary loudness).\n');
  const cfg = parseBrief(text, 'BRIEF.md', nullLog());
  assert.deepEqual(cfg.levels.sfxHold.boom, { rate: 1.2, from: 0.5, maxLift: 36 });
  assert.equal(cfg.levels.sfxDuck.boom, 4);
  assert.deepEqual(cfg.qa.tail, { seconds: 3, lu: 8, sfx: 'boom' });
  const gainText = fixture
    .replace(/\| At event \| Offset \|\r?\n\|---\|---\|---\|---\|---\|---\|/, '| At event | Offset | Gain |\n|---|---|---|---|---|---|---|')
    .replace('| `Right on time.` | strike | 1.80 |', '| `Right on time.` | strike | 1.80 | +3 |');
  const withGain = parseBrief(gainText, 'CLOCK_BRIEF.md', nullLog());
  const narr = withGain.cues.find((c) => c.kind === 'voice');
  assert.equal(narr.gain, 3);
  assert.ok(withGain.cues.filter((c) => c.kind === 'sfx').every((c) => c.gain === 0));
  const card = parseBrief(hello.replace(/\(small[^)]*\)/, '(5.4% of the frame height, 60% white)'), 'BRIEF.md', nullLog());
  const line = card.endCard.lines.find((l) => l.heightPct != null);
  assert.ok(line, 'a line with a height percentage');
  assert.equal(line.heightPct, 5.4);
  assert.equal(line.opacity, 0.6);
});

test('a second loudness target per export: its own files and I/TP, the master keeps its own', () => {
  const cfg = parseBrief(hello, 'BRIEF.md', nullLog());
  assert.equal(cfg.loudness.I, -14);
  assert.equal(cfg.loudness.TP, -1);
  assert.equal(cfg.export.extra.length, 1);
  const x = cfg.export.extra[0];
  assert.deepEqual(x.files, [{ name: 'HELLO_social.mp4', wide: false }, { name: 'HELLO_16x9_social.mp4', wide: true }]);
  assert.equal(x.loudness.I, -10);
  assert.equal(x.loudness.TP, -1);
  assert.equal(x.loudness.tolerance, cfg.loudness.tolerance);
});
