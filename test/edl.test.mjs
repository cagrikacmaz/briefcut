import test from 'node:test';
import assert from 'node:assert/strict';
import { readCueSheet, expandEvents, expandCues, enforceShotRules, snapCutsToBeats, placeCues, offBeatMs } from '../src/core/edl.mjs';
import { nullLog } from '../src/core/util.mjs';

const clip = (frames = 192) => ({ frames, file: 'x.mp4' });
const entry = (key, inF, outF, kind = 'clip', frames = 192) => ({ order: 1, orders: [1], source: key, key, kind, clip: kind === 'card' ? { frames: outF, card: true } : clip(frames), content: '', inF0: inF, outF0: outF, inF, outF, notes: [] });
const cfg = (over = {}) => ({ fps: 24, shotRules: { minShot: 2.0, minDeadCut: 0.75 }, music: { nudgeFrames: 3 }, firstEvent: null, cues: [], ...over });

test('cue sheet: in/out/cut, events, "start", pins and not-found lines', () => {
  const s = readCueSheet('S1', ['in: 0.00', 'out: 3.042', 'cut: 1.0-1.5', '- tap_1: 0.042  (8 fps 0.042)', 'midnight: start', 'bird_1: not found, closest 0.50', 'cue 4: 1.25'].join('\n'));
  assert.equal(s.in, 0);
  assert.equal(s.out, 3.042);
  assert.deepEqual(s.cut, [1.0, 1.5]);
  assert.equal(s.events.tap_1, 0.042);
  assert.equal(s.events.midnight, 'start');
  assert.equal(s.events.bird_1, 0.5);
  assert.deepEqual(s.missing, ['bird_1']);
  assert.equal(s.events['cue 4'], 1.25);
});

test('wildcards expand in time order; empty wildcard and missing event are reported', () => {
  const ev = { step_2: 2.5, step_1: 2.0, step_3: 3.0, gear_drop: 1.9 };
  assert.deepEqual(expandEvents(['step_*'], ev).map((e) => e.event), ['step_1', 'step_2', 'step_3']);
  assert.equal(expandEvents(['tick_*'], ev)[0].wildcardEmpty, true);
  assert.equal(expandEvents(['nope'], ev)[0].time, null);
  assert.equal(expandEvents(['start'], ev)[0].time, 'start');
});

test('cue instances: one per event, offsets applied, pins win', () => {
  const c = cfg({ cues: [{ row: 1, key: 'S1', kind: 'sfx', sfxName: 'tap', voice: 'sfx:tap', events: ['tap_*'], offset: -0.05, time: null }] });
  const out = expandCues(c, { S1: { tap_1: 1.0, tap_2: 2.0, 'cue 1.2': 2.125 } }, nullLog());
  assert.deepEqual(out.map((x) => x.id), ['1.1', '1.2']);
  assert.equal(out[0].time, 0.95);
  assert.equal(out[1].time, 2.125);
  assert.equal(out[1].pinned, true);
});

test('EDL frame math: timeline positions, cue mapping, cut-out drop', () => {
  const entries = [entry('S1', 0, 72), entry('S2', 24, 120)];
  const cues = [
    { id: '1', key: 'S2', kind: 'sfx', eventTime: 2.0, time: 2.0, offset: 0 },
    { id: '2', key: 'S2', kind: 'sfx', eventTime: 0.5, time: 0.5, offset: 0 },
    { id: '3', key: 'S2', kind: 'sfx', eventTime: 1.0, time: 'start', event: 'start', offset: 0 },
  ];
  const total = snapCutsToBeats(entries, cfg(), null, cues, nullLog());
  assert.equal(total, 72 + 96);
  placeCues(entries, cues, cfg(), nullLog());
  assert.equal(cues[0].pictureFrame, 72 + 48 - 24);
  assert.equal(cues[1].status, 'dropped');
  assert.equal(cues[2].pictureFrame, 72);
});

test('beat snap moves cuts toward the grid but never under the minimum shot or past a cue', () => {
  const grid = { period: 0.5, origin: 0 };
  // Shot 1 is 50 frames (2.083 s); the nearest beat cut (48) would take it under 2.0 s + keep cue 49.
  const entries = [entry('S1', 0, 50), entry('S2', 0, 100), entry('END_CARD', 0, 42, 'card')];
  const cues = [{ id: '1', key: 'S1', kind: 'sfx', eventTime: 49 / 24, time: 49 / 24, offset: 0 }];
  snapCutsToBeats(entries, cfg(), grid, cues, nullLog());
  assert.ok(entries[0].outF > 49, 'cue frame stays inside its shot');
  assert.ok(entries[0].outF - entries[0].inF >= 48);
  assert.equal(entries[2].outF - entries[2].inF, 42, 'card keeps its length');
  assert.ok(offBeatMs(entries[1].tlEndF, 24, grid) < 1e-6 || Math.abs(entries[1].outF - 100) === 3);
});

test('shot rules: short gap joined, short shot flagged', () => {
  const log = nullLog();
  const a = entry('S1', 0, 40);
  const b = entry('S1', 50, 100);
  const out = enforceShotRules([a, b, entry('S2', 0, 30)], cfg(), [], log);
  assert.equal(out.length, 2);
  assert.equal(out[0].outF0, 100);
  assert.equal(out[1].short, true);
});

test('first frame within firstEvent seconds of its event', () => {
  // Event at frame 48, listed in point 37 (11 frames before); nudges to 34 or 35 would put the
  // first frame more than 0.5 s (12 frames) before it and are not allowed.
  const entries = [entry('S1', 37, 100), entry('S2', 0, 60)];
  const cues = [{ id: '1', key: 'S1', kind: 'sfx', event: 'tap_1', eventTime: 2.0, time: 2.0, offset: 0 }];
  snapCutsToBeats(entries, cfg({ firstEvent: { event: 'tap_1', seconds: 0.5 } }), { period: 0.5, origin: 0 }, cues, nullLog());
  assert.ok(entries[0].inF >= 36 && entries[0].inF <= 40);
});
