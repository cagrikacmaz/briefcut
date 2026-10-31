import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBrief, clipKey, parseEventList, parseTables } from '../src/core/brief.mjs';
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
