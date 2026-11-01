#!/usr/bin/env node
// briefcut: brief in, film out.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBrief, findBrief, readBrief, clipKey } from '../src/core/brief.mjs';
import { cutFilm, findClips } from '../src/core/cut.mjs';
import { prepareAudio } from '../src/core/prepare.mjs';
import { estimateFilm } from '../src/core/estimate.mjs';
import { ingest } from '../src/core/ingest.mjs';
import { generateClips } from '../src/core/generate.mjs';
import { writeFlowBrief } from '../src/core/prompts.mjs';
import { contactSheet, writeMotion } from '../src/core/sheets.mjs';
import { makeStrip } from '../src/core/strips.mjs';
import { draftCues } from '../src/core/autocues.mjs';
import { regress } from '../src/core/regress.mjs';
import { probeClip, FOOTAGE } from '../src/core/video.mjs';
import { AssetCache } from '../src/core/assets.mjs';
import { audioProvider } from '../src/providers/audio/index.mjs';
import { videoProvider } from '../src/providers/video/index.mjs';
import { Log, ensureDir, writeJson } from '../src/core/util.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const HELP = `briefcut ${VERSION}: brief in, film out.

  briefcut init <dir>                    new film folder with a brief template
  briefcut prompts <dir>                 scene prompts (flow_brief.md) from the brief
  briefcut generate <dir> [--takes n]    clips from an API video provider (jobs in out/jobs.json)
  briefcut ingest <dir> --from <path> [--since 30m] [--match <glob>]
                                         copy video and stills (a download folder, a card) into clips/_takes and probe them
  briefcut sheets <dir> [--takes]        2 fps contact sheets + motion profile per clip (or take)
  briefcut strip <dir> <clip> <seconds> ["label"] [--fps 8|24]
  briefcut prepare <dir>                 voices, music, SFX, ambience (cached, never paid twice)
  briefcut cut <dir>                     edit, mix, master, export, sync_check, QA report
  briefcut run <dir>                     prepare + cut
  briefcut estimate <dir>                cost before any paid call -> out/COST.md
  briefcut regress <dir> <outDir>        re-render in a mirror and compare with the master
  briefcut demo [--out <dir>]            the hello-short example with mock providers, no key

Flags: --offline  --mock  --max-spend <usd>  --brief <file>  --preset <name>  --quiet
Keys come from the environment or the film's .env / .env.txt / .env.local; never printed.`;

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  const valued = new Set(['--from', '--since', '--match', '--fps', '--brief', '--preset', '--max-spend', '--takes', '--out', '--provider', '--seconds']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (valued.has(a)) out.flags[a.slice(2)] = argv[++i];
    else if (a.startsWith('--')) out.flags[a.slice(2)] = true;
    else out._.push(a);
  }
  return out;
}

function load(dir, flags, log) {
  const filmDir = path.resolve(dir);
  const briefFile = findBrief(filmDir, flags.brief);
  const cfg = parseBrief(readBrief(briefFile).text, path.basename(briefFile), log, { preset: flags.preset });
  return { filmDir, cfg };
}

function logFor(dir, name, flags) {
  return new Log(path.join(ensureDir(path.join(path.resolve(dir), 'out')), `${name}.log`), { quiet: !!flags.quiet });
}

const maxSpend = (flags) => (flags['max-spend'] != null ? Number(flags['max-spend']) : null);

async function main() {
  const { _: [cmd, ...pos], flags } = parseArgs(process.argv.slice(2));
  if (cmd === 'version' || flags.version) return console.log(VERSION);
  if (!cmd || cmd === 'help' || flags.help) return console.log(HELP);
  const need = (n) => {
    if (pos.length < n) throw new Error(`usage: see "briefcut help" (${cmd} needs ${n} argument${n > 1 ? 's' : ''})`);
  };

  if (cmd === 'init') {
    need(1);
    const dir = path.resolve(pos[0]);
    if (fs.existsSync(path.join(dir, 'BRIEF.md'))) throw new Error(`${dir} already has a BRIEF.md`);
    ensureDir(path.join(dir, 'clips', '_takes'));
    ensureDir(path.join(dir, 'clips', '_rejected'));
    ensureDir(path.join(dir, 'out'));
    fs.copyFileSync(path.join(ROOT, 'src', 'presets', 'BRIEF_TEMPLATE.md'), path.join(dir, 'BRIEF.md'));
    fs.writeFileSync(path.join(dir, '.gitignore'), '.env*\n!.env.example\nout/\naudio/\nclips/*.mp4\nclips/_takes/\nclips/_rejected/\n');
    fs.copyFileSync(path.join(ROOT, 'src', 'presets', 'env.example'), path.join(dir, '.env.example'));
    console.log(`new film folder: ${dir}\nnext: edit BRIEF.md, then "briefcut prompts ${pos[0]}" (handoff) or "briefcut generate ${pos[0]}" (API provider)`);
    return;
  }

  if (cmd === 'demo') return demo(flags);

  need(1);
  const log = logFor(pos[0], cmd, flags);
  const { filmDir, cfg } = load(pos[0], flags, log);

  if (cmd === 'prompts') {
    const f = writeFlowBrief(cfg, filmDir, { takes: Number(flags.takes || 2), seconds: Number(flags.seconds || cfg.clipSeconds || 8) });
    console.log(`wrote ${f}`);
  } else if (cmd === 'generate') {
    await generateClips({ cfg, filmDir, providerName: flags.mock ? 'mock' : flags.provider, takes: Number(flags.takes || 1), maxSpend: maxSpend(flags), log, seconds: Number(flags.seconds || cfg.clipSeconds || 8) });
  } else if (cmd === 'ingest') {
    if (!flags.from) throw new Error('ingest needs --from <folder>');
    await ingest({ filmDir, from: flags.from, since: flags.since || null, match: flags.match || null, cfg, log });
  } else if (cmd === 'sheets') {
    const dir = ensureDir(path.join(filmDir, 'out', 'sheets'));
    const files = flags.takes
      ? Object.fromEntries(fs.readdirSync(path.join(filmDir, 'clips', '_takes')).filter((f) => FOOTAGE.test(f)).map((f) => [f.replace(/\.[^.]+$/, ''), path.join(filmDir, 'clips', '_takes', f)]))
      : findClips(filmDir);
    for (const [k, f] of Object.entries(files)) {
      const clip = await probeClip(f, cfg, null);
      const name = flags.takes ? k : path.parse(f).name;
      // A still has one picture: one tile.
      await contactSheet(f, path.join(dir, `${name}.jpg`), { fps: cfg.sync.sheetFps, width: cfg.sync.sheetWidth, srcFps: clip.fps, frames: clip.still ? 1 : clip.frames });
      await writeMotion(f, path.join(dir, `${name}.motion.tsv`), clip.fps);
      console.log(`out/sheets/${name}.jpg (${clip.width}x${clip.height}, ${clip.still ? 'still, held for its EDL length' : `${clip.frames} frames`})`);
    }
  } else if (cmd === 'strip') {
    need(3);
    const files = findClips(filmDir);
    const key = clipKey(pos[1]);
    if (!files[key]) throw new Error(`no clip ${pos[1]}`);
    const t = Number(pos[2]);
    const fps = Number(flags.fps || cfg.sync.stripFps);
    const clip = await probeClip(files[key], cfg, null);
    const out = path.join(ensureDir(path.join(filmDir, 'out', 'strips')), `${key}_${t.toFixed(2)}_${fps}fps.jpg`);
    await makeStrip(files[key], t, out, { clipFps: clip.fps, stripFps: fps, window: cfg.sync.stripWindow, width: fps >= clip.fps ? cfg.sync.checkWidth : cfg.sync.stripWidth, frames: clip.frames, label: pos[3] || '', workDir: ensureDir(path.join(filmDir, 'out', 'work')) });
    console.log(path.relative(process.cwd(), out));
  } else if (cmd === 'estimate') {
    const provider = audioProvider(flags.mock ? 'mock' : cfg.tts.provider, { filmDir, log });
    const vp = cfg.scenes.length ? videoProvider(cfg.video.provider, { filmDir, log, cfg }) : null;
    const r = await estimateFilm({ cfg, filmDir, provider, videoProvider: vp, log });
    console.log(`out/COST.md: ${r.rows.length} requests, ${r.rows.filter((x) => !x.cached).length} to generate, about ${r.unit ? `${Math.round(r.credits).toLocaleString('en-US')} ${r.unit}` : `${r.total.toFixed(2)} USD`}`);
  } else if (cmd === 'prepare' || cmd === 'run') {
    const provider = audioProvider(flags.mock ? 'mock' : cfg.tts.provider, { filmDir, log });
    const est = await estimateFilm({ cfg, filmDir, provider, log });
    if (maxSpend(flags) != null && est.total > maxSpend(flags) + 1e-9) throw new Error(`--max-spend ${maxSpend(flags)} USD: this film needs about ${est.total.toFixed(2)} USD of new audio (out/COST.md); nothing was sent`);
    const cache = new AssetCache(path.join(filmDir, 'audio'), { log, offline: !!flags.offline, maxSpend: maxSpend(flags), priceOf: (r) => provider.price(r) });
    const got = await prepareAudio({ cfg, filmDir, provider, cache, log });
    writeJson(path.join(filmDir, 'audio', 'voices.json'), got.voiceIds);
    log.info(`prepare: ${cache.usage.generated.length} generated, ${cache.usage.reused} reused, about ${cache.usage.spentUsd.toFixed(2)} USD`);
    if (cmd === 'run') await cutFilm({ filmDir, brief: flags.brief, preset: flags.preset, offline: !!flags.offline, mock: !!flags.mock, maxSpend: maxSpend(flags), quiet: !!flags.quiet });
  } else if (cmd === 'cut') {
    await cutFilm({ filmDir, brief: flags.brief, preset: flags.preset, offline: !!flags.offline, mock: !!flags.mock, maxSpend: maxSpend(flags), quiet: !!flags.quiet });
  } else if (cmd === 'regress') {
    need(2);
    const r = await regress({ filmDir, outDir: pos[1], log, offline: !flags.online });
    if (!r.pass) process.exitCode = 1;
  } else throw new Error(`unknown command "${cmd}"; see "briefcut help"`);
}

// The demo: hello-short with mock video and mock audio, no key, about a minute.
async function demo(flags) {
  const t0 = Date.now();
  const src = path.join(ROOT, 'examples', 'hello-short');
  const dir = path.resolve(flags.out || path.join(process.cwd(), 'briefcut-demo'));
  ensureDir(dir);
  fs.copyFileSync(path.join(src, 'BRIEF.md'), path.join(dir, 'BRIEF.md'));
  const log = logFor(dir, 'demo', flags);
  const { cfg } = load(dir, {}, log);
  console.log(`briefcut demo in ${dir}`);
  await generateClips({ cfg, filmDir: dir, providerName: 'mock', log, seconds: cfg.clipSeconds || 3, pollMs: 0, sleep: async () => {} });
  const clips = {};
  for (const [k, f] of Object.entries(findClips(dir))) clips[k] = await probeClip(f, cfg, null);
  await draftCues(cfg, clips, path.join(dir, 'out', 'cues.md'), log);
  const r = await cutFilm({ filmDir: dir, mock: true, quiet: !!flags.quiet });
  console.log(`\n${r.failed.length ? `QA FAIL: ${r.failed.join(', ')}` : 'QA: all checks pass'}; ${r.qa.duration.toFixed(2)} s, ${r.loud.I.toFixed(2)} LUFS, worst sync ${r.qa.worstFrameError.toFixed(2)} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.log(`master: ${r.masterFile}\nreport: ${path.join(dir, 'out', 'REPORT.md')}\nsync check: ${path.join(dir, 'out', 'sync_check.jpg')}`);
  if (r.failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`briefcut: ${e.message}`);
  if (process.env.BRIEFCUT_DEBUG) console.error(e.stack);
  process.exit(1);
});
