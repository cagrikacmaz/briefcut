// Golden test: the full demo (mock video with white flashes on known frames, mock audio with
// leading silence) through generate -> draft cues -> cut. Every sound must sit within ±1 frame
// of its known flash, the master at -14 ±0.5 LUFS with true peak ≤ -1 dBTP, every QA row PASS.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readJson } from '../src/core/util.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('demo film: frame-exact sync, loudness, all QA pass', { timeout: 600000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'briefcut-golden-'));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'briefcut.mjs'), 'demo', '--out', dir, '--quiet'], { encoding: 'utf8', timeout: 600000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);

  const cues = readJson(path.join(dir, 'out', 'cue_times.json'));
  const report = fs.readFileSync(path.join(dir, 'out', 'REPORT.md'), 'utf8');
  assert.ok(!/\| FAIL \|/.test(report), report.split('\n').filter((l) => l.includes('FAIL')).join('\n'));

  // Ground truth: the mock clips' flash frames, mapped through the rendered EDL.
  const edl = report.split('## Edit decision list')[1].split('\n## ')[0].split('\n').filter((l) => /^\| \d/.test(l)).map((l) => l.split('|').map((c) => c.trim()));
  const fps = 24;
  const tlStart = {};
  const inPoint = {};
  for (const row of edl) {
    const src = row[2];
    const [inS] = row[4].split('-').map(Number);
    const [tl] = row[6].split('-').map(Number);
    tlStart[src] = tl;
    inPoint[src] = inS;
  }
  let checked = 0;
  for (const scene of ['S1_BLUE', 'S2_GREEN', 'S3_RED']) {
    const truth = readJson(path.join(dir, 'clips', `${scene}.events.json`));
    for (const [name, frame] of Object.entries(truth.events)) {
      const c = Object.values(cues).find((x) => x.scene === scene && x.event === name && x.sound.startsWith('sfx:'));
      assert.ok(c, `cue for ${scene} ${name}`);
      const expected = tlStart[scene] + (frame - Math.round(inPoint[scene] * fps)) / fps;
      assert.ok(Math.abs(c.picture - expected) < 1e-6, `${scene} ${name}: picture ${c.picture} vs flash ${expected}`);
      assert.ok(Math.abs(c.frameError) <= 1, `${scene} ${name}: ${c.frameError} frames`);
      checked++;
    }
  }
  assert.equal(checked, 7);

  const loud = report.match(/I (-?[\d.]+) LUFS, TP (-?[\d.]+) dBTP/);
  assert.ok(Math.abs(Number(loud[1]) + 14) <= 0.5, `integrated ${loud[1]}`);
  assert.ok(Number(loud[2]) <= -1, `true peak ${loud[2]}`);
  for (const f of ['HELLO_master.mp4', 'HELLO_preview_360p.mp4', 'HELLO_16x9.mp4', 'HELLO_social.mp4', 'HELLO_16x9_social.mp4', 'sync_check.jpg', 'edl_sheet.jpg', 'SUMMARY.md']) assert.ok(fs.existsSync(path.join(dir, 'out', f)), f);
  // Second loudness target: both social files at -10 ±0.5 LUFS, true peak ≤ -1 dBTP, own QA rows.
  for (const name of ['HELLO_social.mp4', 'HELLO_16x9_social.mp4']) {
    const row = report.split('\n').find((l) => l.includes(`\`${name}\`: -10 LUFS`));
    assert.ok(row && row.includes('| PASS |'), `QA row for ${name}: ${row}`);
    const m = row.match(/I (-?[\d.]+) LUFS, TP (-?[\d.]+) dBTP/);
    assert.ok(Math.abs(Number(m[1]) + 10) <= 0.5, `${name} integrated ${m[1]}`);
    assert.ok(Number(m[2]) <= -1, `${name} true peak ${m[2]}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});
