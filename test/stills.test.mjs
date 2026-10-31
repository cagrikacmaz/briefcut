// Own footage: a still in clips/ is a held shot of exactly its EDL length, and ingest takes every
// video file and still from a folder (a camera card, a download folder) without a match glob.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ffmpeg, probe } from '../src/core/ff.mjs';
import { probeClip, renderPicture, retimeFilters } from '../src/core/video.mjs';
import { findClips } from '../src/core/cut.mjs';
import { ingest } from '../src/core/ingest.mjs';
import { loadPreset } from '../src/core/brief.mjs';

const log = { assume() {}, info() {}, warn() {} };

test('a still is found in clips/ and rendered as a held shot of exactly its frames', { timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'briefcut-still-'));
  fs.mkdirSync(path.join(dir, 'clips'));
  const png = path.join(dir, 'clips', 'S2_PHOTO.png');
  await ffmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=800x600:rate=1', '-frames:v', '1', png]);
  const cfg = { ...loadPreset('default'), width: 360, height: 640, fps: 24 };
  cfg.export = { ...cfg.export, x264Preset: 'ultrafast', crf: 30 };
  assert.equal(findClips(dir).S2, png);
  const clip = await probeClip(png, cfg, log);
  assert.equal(clip.still, true);
  assert.equal(clip.hasAudio, false);
  const out = path.join(dir, 'picture.mp4');
  const graph = await renderPicture([{ kind: 'clip', clip, inF: 0, outF: 30, tlStartF: 0, tlEndF: 30 }], cfg, out, dir);
  const v = (await probe(out)).streams.find((s) => s.codec_type === 'video');
  assert.equal(Number(v.nb_frames), 30);
  assert.equal(`${v.width}x${v.height}`, '360x640');
  assert.deepEqual(retimeFilters(graph), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ingest without a match glob takes video files and stills, nothing else', { timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'briefcut-ingest-'));
  const card = path.join(dir, 'card');
  fs.mkdirSync(card);
  await ffmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=24', '-t', '0.5', '-pix_fmt', 'yuv420p', path.join(card, 'A001.MOV')]);
  await ffmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=1', '-frames:v', '1', path.join(card, 'IMG_0001.jpg')]);
  fs.writeFileSync(path.join(card, 'notes.txt'), 'not footage');
  const film = path.join(dir, 'film');
  fs.mkdirSync(film);
  const rows = await ingest({ filmDir: film, from: card, cfg: { width: 1080, height: 1920, fps: 24 }, log });
  assert.deepEqual(rows.map((r) => r.name).sort(), ['A001.MOV', 'IMG_0001.jpg']);
  assert.equal(rows.find((r) => r.name === 'IMG_0001.jpg').still, true);
  assert.match(fs.readFileSync(path.join(film, 'clips', '_takes', 'INGEST.md'), 'utf8'), /still: held shot at cut/);
  fs.rmSync(dir, { recursive: true, force: true });
});
