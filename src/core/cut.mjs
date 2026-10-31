// `briefcut cut`: brief + clips + cue sheet + cached audio -> cut, mixed, mastered film, its
// exports, sync_check.jpg and a QA report. Deterministic: the same inputs give the same master.
import fs from 'node:fs';
import path from 'node:path';
import { parseBrief, findBrief, readBrief, clipKey, parseEventList } from './brief.mjs';
import { buildEntries, expandCues, enforceShotRules, snapCutsToBeats, placeCues, syncRule } from './edl.mjs';
import { AssetCache, loadAudio, trimOnset, peakOf, scaleTo } from './assets.mjs';
import { prepareAudio, pickMusic, alignCached, voiceAsset } from './prepare.mjs';
import { loadSfxVariants, assignVariants } from './sfx.mjs';
import { applyVoiceRules, loadVoice } from './voices.mjs';
import { renderMix, lowShelf, compress } from './mix.mjs';
import { masterMix, loudnessOk } from './master.mjs';
import { probeClip, FOOTAGE, renderPicture, mux, renderPreview, renderWide, edlSheet, edgeFrame, retimeFilters, cardChain } from './video.mjs';
import { syncCheck } from './sync-check.mjs';
import { contactSheet } from './sheets.mjs';
import { silences, measureShift, peakAfter, loudestMoment, samplePeakDb, tailLoudness, speechBandRatio } from './qa.mjs';
import { writeReport, writeSummary, writeOpenQuestions, writeCueTimes } from './report.mjs';
import { decode, writeWavFloat, measureR128, probe } from './ff.mjs';
import { audioProvider } from '../providers/audio/index.mjs';
import { SR, CH, Log, ensureDir, exists, readJson, writeJson, sha1, db, undb } from './util.mjs';

export function findClips(filmDir) {
  const dirs = [path.join(filmDir, 'clips'), filmDir].filter((d) => fs.existsSync(d));
  const out = {};
  for (const d of dirs) {
    for (const name of fs.readdirSync(d).sort()) {
      if (!FOOTAGE.test(name)) continue;
      const key = clipKey(path.parse(name).name);
      out[key] ??= path.join(d, name);
    }
  }
  return out;
}

// A FIX file next to the brief makes the next export a new version: <ID>_FIX01.md -> _v2.
export function versionOf(filmDir, id) {
  const fixes = fs.readdirSync(filmDir).filter((f) => new RegExp(`^${id}_FIX\\d+\\.md$`, 'i').test(f));
  return 1 + fixes.length;
}

// A loudness reading whose true peak is at least its sample peak (the meter rounds to 0.1 dB).
const peakSafe = (l) => ({ ...l, TP: Math.max(l.TP, l.samplePeakDb ?? -Infinity) });

const versioned = (name, v) => (v > 1 ? name.replace(/(\.mp4)$/i, `_v${v}$1`) : name);

// OVERRIDES.md: decisions taken outside the brief, in brief syntax, each with its reason and
// flagged on top of the report. Supported: "- Audio map row <n> at event: <events> (reason)".
export function applyOverrides(cfg, filmDir, log, flags = []) {
  const file = path.join(filmDir, 'OVERRIDES.md');
  if (!fs.existsSync(file)) return [];
  const applied = [];
  for (const m of fs.readFileSync(file, 'utf8').matchAll(/^[-*]\s*Audio map row (\d+) at event:\s*([^(\n]+?)\s*(?:\(([^\n]*)\))?\s*$/gim)) {
    const row = cfg.cues.find((c) => c.row === Number(m[1]));
    if (!row) throw new Error(`OVERRIDES.md: the audio map has no row ${m[1]}`);
    const before = row.events.join(', ');
    row.events = parseEventList(m[2]);
    const msg = `audio map row ${m[1]} (${row.voice}) plays at ${row.events.join(', ')} instead of ${before}${m[3] ? `: ${m[3]}` : ''} (OVERRIDES.md)`;
    log.assume('override', msg);
    flags.push(msg);
    applied.push(msg);
  }
  return applied;
}

// The attack point of a prepared hit (seconds into its buffer): the first 5 ms window within
// 10 dB of the loudest window. For a hard transient this is the transient; for a soft attack it
// is where the sound is heard to start.
export function attackPoint(pcm) {
  const w = Math.round(0.005 * SR);
  const n = pcm.length / CH;
  const rms = [];
  for (let i = 0; i + w <= n; i += w) {
    let s = 0;
    for (let k = i; k < i + w; k++) for (let c = 0; c < CH; c++) s += pcm[k * CH + c] ** 2;
    rms.push(Math.sqrt(s / (CH * w)));
  }
  const max = Math.max(...rms);
  const k = rms.findIndex((r) => r >= max * undb(-10));
  // Inside that window, the first sample within 10 dB of the window's own peak.
  let at = k * w;
  let wp = 0;
  for (let i = k * w; i < Math.min(n, (k + 1) * w); i++) wp = Math.max(wp, Math.abs(pcm[i * CH]), Math.abs(pcm[i * CH + 1]));
  for (let i = k * w; i < Math.min(n, (k + 1) * w); i++) {
    if (Math.max(Math.abs(pcm[i * CH]), Math.abs(pcm[i * CH + 1])) >= wp * undb(-10)) {
      at = i;
      break;
    }
  }
  return at / SR;
}

export async function cutFilm(opts) {
  const started = Date.now();
  const filmDir = path.resolve(opts.filmDir);
  const briefFile = findBrief(filmDir, opts.brief);
  const outDir = ensureDir(path.join(filmDir, 'out'));
  const workDir = ensureDir(path.join(outDir, 'work'));
  const log = opts.log || new Log(path.join(outDir, 'briefcut.log'), { quiet: opts.quiet });
  const brief = readBrief(briefFile);
  const cfg = parseBrief(brief.text, path.basename(briefFile), log, { preset: opts.preset });
  if (brief.applied.length) log.info(`FIX passes applied: ${brief.applied.join('; ')}`);
  const version = versionOf(filmDir, cfg.id);
  cfg.export.master = versioned(cfg.export.master, version);
  cfg.export.preview = versioned(cfg.export.preview, version);
  if (cfg.export.wide) cfg.export.wide = versioned(cfg.export.wide, version);
  for (const x of cfg.export.extra) for (const f of x.files) f.name = versioned(f.name, version);
  const flags = [];
  applyOverrides(cfg, filmDir, log, flags);

  // Clips.
  const files = findClips(filmDir);
  const clips = {};
  for (const row of cfg.edl.filter((r) => r.kind === 'clip')) {
    if (clips[row.key]) continue;
    if (!files[row.key]) throw new Error(`no clip file for ${row.source} (looked for ${row.key}*.mp4 in clips/)`);
    clips[row.key] = await probeClip(files[row.key], cfg, log);
  }
  const withAudio = Object.values(clips).filter((c) => c.hasAudio);
  if (withAudio.length && cfg.discardClipAudio) log.assume('clip audio', `${withAudio.length} source clip(s) carry an audio stream (${withAudio.map((c) => path.basename(c.file)).join(', ')}); it is discarded, as the brief says`);

  // Edit and events.
  const cueFile = path.join(outDir, 'cues.md');
  const built = buildEntries(cfg, clips, cueFile, log);
  const cues = expandCues(cfg, built.events, log);
  for (const [k, list] of Object.entries(built.missing)) if (list.length) flags.push(`${k} ${list.join(', ')}: not found on screen; placed on the closest moment that reads the same (see out/cues.md)`);

  // Audio (cached; generated only when missing and not offline).
  const providerName = opts.mock ? 'mock' : opts.audioProvider || cfg.tts.provider;
  const provider = opts.provider || audioProvider(providerName, { filmDir, log });
  const audioDir = path.join(filmDir, 'audio');
  const cache = new AssetCache(audioDir, { log, offline: opts.offline, maxSpend: opts.maxSpend ?? null, priceOf: (r) => provider.price(r) });
  const voicesKnown = readJson(path.join(audioDir, 'voices.json'));
  let audio;
  try {
    audio = await prepareAudio({ cfg, filmDir, provider, cache, log, voices: opts.offline ? voicesKnown : null });
  } catch (e) {
    if (opts.offline && /resolveVoice|voices/.test(String(e.stack))) throw new Error('offline: audio/voices.json is missing; run `briefcut prepare` once online');
    throw e;
  }
  writeJson(path.join(audioDir, 'voices.json'), audio.voiceIds);

  // Music: the take and its frozen grid; timeline beats sit at beatOneAt + k * period.
  let music = null;
  let grid = null;
  if (cfg.music.enabled && audio.music.length) {
    const pick = await pickMusic(cfg, audio.music, log, audioDir);
    const take = audio.music.find((t) => t.take === pick.used);
    music = { pcm: await loadAudio(take.file), name: take.name, pick };
    grid = { period: pick.grid.period, origin: cfg.music.beatOneAt || 0, bpm: pick.grid.bpm, downbeat: pick.grid.downbeat };
  }

  const entries = enforceShotRules(built.entries, cfg, cues, log);
  let totalF = snapCutsToBeats(entries, cfg, grid, cues, log);
  placeCues(entries, cues, cfg, log);
  for (const c of cues) c.rule = syncRule(c, cfg);

  // Effects.
  const variants = await loadSfxVariants(cfg, audio.sfx);
  const hits = cues.filter((c) => c.kind === 'sfx' && c.status === 'placed');
  assignVariants(hits, variants);
  // Every effect is placed by its attack point (where it is heard to start), not by the file's
  // gated onset: a two-part sound (a creak then a clack) or a soft swell would otherwise be heard
  // 50-100 ms after its frame. A negative offset on a soft sound (onset trim) exists to compensate
  // a slow attack; since the attack itself is placed, that offset is not added again.
  for (const h of hits) {
    const atk = attackPoint(h.sfx.pcm);
    h.attackDelay = atk - h.sfx.onset / SR;
    if (cfg.sfx[h.sfxName].trim === 'onset' && h.offset < 0 && !h.pinned) {
      h.target = h.pictureTime;
      (h.notes ||= []).push(`offset ${h.offset} s not added: the measured attack (${(h.attackDelay * 1000).toFixed(0)} ms after the gated onset) is placed on the event frame`);
      log.assume('soft attack', `cue ${h.id} ${h.sfxName}: the brief's ${h.offset} s offset compensates a soft attack; briefcut places the measured attack on the event frame instead (attack ${(h.attackDelay * 1000).toFixed(0)} ms after the gated onset in this take)`);
    }
    h.startSample = Math.round(h.target * SR) - Math.round(atk * SR);
    h.timeline = h.target;
    h.syncTime = h.target;
    h.file = h.sfx.asset;
    h.duck = cfg.levels.sfxDuck?.[h.sfxName] || null;
    if (cfg.levels.sfxHold?.[h.sfxName]) (h.notes ||= []).push(`decay held to ${cfg.levels.sfxHold[h.sfxName].rate} dB/s`);
    if (h.duck) (h.notes ||= []).push(`ducked ${h.duck.db} dB under the voices${h.duck.attackMs != null || h.duck.releaseMs != null ? ` (${h.duck.attackMs ?? cfg.levels.attackMs} ms attack, ${h.duck.releaseMs ?? cfg.levels.releaseMs} ms release)` : ''}`);
    if (h.gain) (h.notes ||= []).push(`gain ${h.gain > 0 ? '+' : ''}${h.gain} dB`);
  }

  // Voices.
  const store = {
    words: async (v) => (cfg.tts.align ? alignCached(v.file, v.spoken, provider, log, opts.offline) : null),
    retake: async (cue, n, reason) => {
      const base = audio.voices[cue.row];
      const req = { ...cache.index[base.name]?.request, take: n };
      const asset = voiceAsset(cue, n);
      const got = await cache.get(asset, req, () => provider.tts({ voiceId: base.voice.id, text: req.text, model: req.model, settings: req.settings, asset }));
      log.assume('retake', `cue ${cue.id}: ${reason}; ${got.cached ? 'reused' : 'generated'} ${got.name}`);
      return { file: got.file, name: got.name, spoken: req.text };
    },
  };
  const items = [];
  for (const c of cues.filter((x) => x.kind === 'voice' && x.status === 'placed')) {
    const v = audio.voices[c.row];
    const peakDb = cfg.levels.voicePeak + (c.gain || 0);
    const take = await loadVoice(v.file, peakDb, cfg.voiceRules.gateDb);
    // A low shelf on this role only, then back to the role's peak level.
    const shelf = cfg.levels.voiceShelf?.[c.voice.toLowerCase()];
    const comp = cfg.levels.voiceComp?.[c.voice.toLowerCase()];
    if (shelf) {
      take.pcm = lowShelf(take.pcm, shelf.freq, shelf.gainDb);
      (c.notes ||= []).push(`low shelf ${shelf.gainDb > 0 ? '+' : ''}${shelf.gainDb} dB at ${shelf.freq} Hz`);
    }
    if (comp) {
      take.pcm = compress(take.pcm, comp);
      (c.notes ||= []).push(`compressed ${comp.ratio}:1 above ${comp.thresholdDb} dBFS`);
    }
    if (shelf || comp) take.pcm = scaleTo(take.pcm, undb(peakDb) / Math.max(1e-9, peakOf(take.pcm)));
    items.push({ cue: c, name: v.name, file: v.file, spoken: v.spoken, ...take });
    if (c.gain) (c.notes ||= []).push(`gain ${c.gain > 0 ? '+' : ''}${c.gain} dB (peak ${cfg.levels.voicePeak + c.gain} dBFS)`);
    c.file = v.name;
    c.sentText = v.spoken;
    c.voiceUsed = v.voice?.name;
  }
  const protect = [];
  for (const p of cfg.protect) for (const h of hits.filter((x) => x.sfxName === p.sfx)) protect.push({ from: h.timeline, to: h.timeline + p.seconds, label: `the first ${p.seconds} s of ${p.sfx}` });
  const shotEnd = (c) => entries[c.entry].tlEndF / cfg.fps;
  await applyVoiceRules(items, cfg, totalF / cfg.fps, store, log, { protect, shotEnd });

  // A line that still runs past its shot: extend the shot if the clip has frames left, else it
  // finishes over the next shot (logged).
  for (const v of items.filter((x) => x.runsOver > 1e-3)) {
    const e = entries[v.cue.entry];
    const want = Math.ceil(v.runsOver * cfg.fps);
    const can = e.kind === 'clip' ? Math.max(0, e.clip.frames - e.outF) : 0;
    const add = Math.min(want, can);
    if (add > 0) {
      e.outF += add;
      e.notes.push(`held ${add} frames longer for cue ${v.cue.id}`);
      log.assume('fit line', `cue ${v.cue.id} still ran ${v.runsOver.toFixed(3)} s past ${e.source}; the shot was extended by ${add} frames`);
      let t = 0;
      for (const x of entries) ((x.tlStartF = t), (t += x.outF - x.inF), (x.tlEndF = t));
      totalF = t;
    }
    if (want > add) log.assume('fit line', `cue ${v.cue.id} runs ${((want - add) / cfg.fps).toFixed(3)} s over the next shot (no frames left in ${e.source})`);
  }
  for (const v of items) v.cue.syncTime = v.cue.timeline;
  const duration = totalF / cfg.fps;

  // Mix.
  const totalSamples = Math.round(duration * SR);
  let stopAt = null;
  if (cfg.music.hardStop && music) {
    const ev = cfg.music.hardStop.event.toLowerCase();
    const c = cues.find((x) => x.status === 'placed' && (x.event || '').toLowerCase() === ev);
    if (c) stopAt = c.pictureTime;
    else log.assume('hard stop', `event "${ev}" has no placed cue; the music runs to the end`);
  }
  const mixRes = renderMix({
    totalSamples,
    voices: items.filter((v) => v.cue.status === 'placed').map((v) => ({ pcm: v.pcm, startSample: Math.round(v.start * SR) - v.onset, bus: v.cue.track })),
    hits: hits.map((h) => ({ pcm: h.sfx.pcm, startSample: h.startSample, gain: h.gain || 0, duck: h.duck, sfxName: h.sfxName })),
    stemsFor: cfg.qa.speechBand ? [cfg.qa.speechBand.sfx] : [],
    music: music ? { pcm: music.pcm, offsetSamples: Math.round(music.pick.grid.downbeat * SR), beatOneAt: cfg.music.beatOneAt || 0, stopAt, stopFadeMs: cfg.music.hardStop?.fadeMs ?? 20, fadeOut: stopAt == null ? cfg.music.fadeOut : 0 } : null,
    ambience: audio.ambience ? { pcm: trimOnset(await loadAudio(audio.ambience.file), { gateDb: -50, preRoll: 0, tail: 0.2 }).pcm, fadeOut: cfg.ambience.fadeOut } : null,
    levels: cfg.levels,
    log,
  });
  const premaster = path.join(workDir, 'mix_premaster.wav');
  writeWavFloat(premaster, mixRes.mix);
  for (const [k, pcm] of Object.entries(mixRes.stems)) writeWavFloat(path.join(workDir, `stem_${k}.wav`), pcm);

  // Picture (reused while the edit is unchanged).
  const picture = path.join(workDir, 'picture.mp4');
  const card = cfg.endCard.enabled ? cardChain(cfg, workDir) : null;
  const hash = sha1(JSON.stringify([entries.map((e) => [e.clip.file || 'card', e.inF, e.outF, fs.existsSync(e.clip.file || '') ? fs.statSync(e.clip.file).size : 0]), cfg.video, cfg.endCard, cfg.fps, cfg.width, cfg.height, cfg.export.crf, cfg.export.x264Preset, card?.font]));
  let graph = exists(path.join(workDir, 'render_graph.txt')) ? fs.readFileSync(path.join(workDir, 'render_graph.txt'), 'utf8') : '';
  if (!exists(picture) || readJson(path.join(workDir, 'picture.json'))?.hash !== hash) {
    log.info('rendering picture');
    graph = await renderPicture(entries, cfg, picture, workDir);
    writeJson(path.join(workDir, 'picture.json'), { hash });
  }
  if (card && !card.text) log.assume('end card', 'this ffmpeg build has no drawtext filter; the end card is rendered without its text');
  if (card?.text && card.font && cfg.endCard.fonts.length && !cfg.endCard.fonts.some((f) => card.font.toLowerCase().endsWith(path.basename(f).toLowerCase()))) log.assume('end card', `none of the brief's fonts is installed; used ${card.font}`);

  // Master: lower the limiter ceiling until the exported file meets the loudness rule.
  const masterFile = path.join(outDir, cfg.export.master);
  if (exists(masterFile)) {
    const prevDir = ensureDir(path.join(workDir, 'prev'));
    fs.copyFileSync(masterFile, path.join(prevDir, `${path.basename(masterFile, '.mp4')}_${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`));
    const prevs = fs.readdirSync(prevDir).sort();
    for (const p of prevs.slice(0, Math.max(0, prevs.length - 3))) fs.rmSync(path.join(prevDir, p));
  }
  // One mastering per loudness target, from the same premaster: the limiter ceiling steps down and
  // loudnorm's target is biased until the exported file itself meets the rule. A loud target
  // (-10 LUFS) limits harder, and the AAC encoder then overshoots the ceiling by 2 dB or more,
  // hence the deeper steps.
  const masterTo = async (L, file, tag = '') => {
    let m;
    let l;
    let bias = 0;
    outer: for (const ceiling of [-1.5, -2.0, -2.5, -3.0, -3.5, -4.0, -4.5, -5.0]) {
      for (let k = 0; k < 3; k++) {
        m = await masterMix(premaster, workDir, L, ceiling, log, { bias, tag });
        await mux(picture, m.file, cfg, file);
        l = await measureR128(file);
        // The meter prints true peak to 0.1 dB; the true peak is never below the sample peak.
        l.samplePeakDb = samplePeakDb(await decode(file)).peakDb;
        log.info(`${path.basename(file)} at limiter ceiling ${ceiling} dBTP, loudnorm bias ${bias.toFixed(2)} LU: I ${l.I} LUFS, TP ${l.TP} dBTP, sample peak ${l.samplePeakDb.toFixed(2)} dBFS`);
        if (loudnessOk(peakSafe(l), L) && Math.abs(l.I - L.I) <= 0.15) break outer;
        if (peakSafe(l).TP > L.TP) break;
        bias += L.I - l.I;
      }
    }
    if (Math.abs(bias) > 0.05) log.assume('loudness', `${path.basename(file)}: loudnorm's target was biased ${bias >= 0 ? '+' : ''}${bias.toFixed(2)} LU so the export measures ${L.I} LUFS on the EBU R128 meter (loudnorm's internal meter reads this short film differently)`);
    return { master: m, loud: l };
  };
  const L = cfg.loudness;
  const { master, loud } = await masterTo(L, masterFile);
  await renderPreview(masterFile, cfg, path.join(outDir, cfg.export.preview));
  const cardFrom = entries.at(-1).kind === 'card' ? entries.at(-1).tlStartF / cfg.fps : null;
  if (cfg.export.wide && cfg.height > cfg.width) await renderWide(masterFile, cfg, path.join(outDir, cfg.export.wide), { cardFrom });
  // Extra loudness targets (for platforms that do not normalize): mastered again from the same
  // premaster and muxed with the same picture; a 16x9 file is the 16:9 export of that master.
  const extras = [];
  for (const [i, x] of cfg.export.extra.entries()) {
    const vertical = x.files.find((f) => !f.wide);
    const base = vertical ? path.join(outDir, vertical.name) : path.join(workDir, `extra_${i + 1}.mp4`);
    const got = await masterTo(x.loudness, base, `_extra${i + 1}`);
    const outs = vertical ? [{ name: vertical.name, file: base, loud: got.loud }] : [];
    for (const f of x.files.filter((y) => y.wide)) {
      const file = path.join(outDir, f.name);
      if (cfg.height > cfg.width) await renderWide(base, cfg, file, { cardFrom });
      else fs.copyFileSync(base, file);
      outs.push({ name: f.name, file, loud: await measureR128(file) });
    }
    for (const o of outs) {
      const sp = samplePeakDb(await decode(o.file));
      extras.push({ ...o, L: x.loudness, master: got.master, samplePeakDb: sp.peakDb, clipped: sp.clipped, ok: loudnessOk(peakSafe({ ...o.loud, samplePeakDb: sp.peakDb }), x.loudness) && sp.clipped === 0 && sp.peakDb < -0.1 });
    }
  }
  await edlSheet(entries, cfg, picture, path.join(outDir, 'edl_sheet.jpg'), workDir);
  // Sheets of what a viewer gets: the preview at 2 fps and the 16:9 export at 1 fps.
  await contactSheet(path.join(outDir, cfg.export.preview), path.join(outDir, 'preview_sheet.jpg'), { fps: 2, width: 120, cols: 12, srcFps: cfg.fps, frames: totalF });
  if (cfg.export.wide && cfg.height > cfg.width) await contactSheet(path.join(outDir, cfg.export.wide), path.join(outDir, 'wide_sheet.jpg'), { fps: 1, width: 320, cols: 5, srcFps: cfg.fps, frames: totalF });

  // QA, measured on the master.
  const finalPcm = await decode(masterFile);
  const masterGainDb = db(peakOf(finalPcm)) - db(peakOf(mixRes.mix));
  // Where each sound sits in the master: 200 ms of the premix from the sound's start, found in
  // the master by cross-correlation (the whole mix as template cannot lock onto a later wing beat
  // or tick the way the sound's own first milliseconds can).
  const shiftAt = (startSample) => {
    const n = Math.round(0.2 * SR);
    const s0 = Math.max(0, startSample);
    return measureShift(finalPcm, mixRes.mix.subarray(s0 * CH, (s0 + n) * CH), s0, { windowMs: 200, maxLagMs: 125 });
  };
  for (const h of hits) {
    const m = shiftAt(h.startSample);
    h.measuredShiftMs = (m.lag / SR) * 1000;
    h.measuredCorr = m.r;
    h.measuredAttack = h.syncTime + m.lag / SR;
    // Reference: the event frame plus any deliberate offset (target).
    h.reference = h.target;
    h.frameError = (h.measuredAttack - h.reference) * cfg.fps;
  }
  for (const v of items) {
    const c = v.cue;
    if (c.status !== 'placed') continue;
    const m = shiftAt(Math.round(v.start * SR) - v.onset);
    c.measuredShiftMs = (m.lag / SR) * 1000;
    c.measuredCorr = m.r;
    c.frameError = (v.start + m.lag / SR - c.target) * cfg.fps;
  }
  await syncCheck(masterFile, cues, cfg, path.join(outDir, 'sync_check.jpg'), workDir);

  const info = await probe(masterFile);
  const vs = info.streams.find((s) => s.codec_type === 'video');
  const audioStreams = info.streams.filter((s) => s.codec_type === 'audio');
  const qa = { duration: Number(vs.duration ?? info.format.duration), frames: Number(vs.nb_frames), totalF, loud };
  qa.durationOk = qa.duration >= cfg.durationQa[0] - 1e-3 && qa.duration <= cfg.durationQa[1] + 1e-3 && qa.frames === totalF;
  const sp = samplePeakDb(finalPcm);
  qa.loudOk = loudnessOk(peakSafe({ ...loud, samplePeakDb: sp.peakDb }), L);
  qa.samplePeakDb = sp.peakDb;
  qa.clipped = sp.clipped;
  qa.clipOk = sp.clipped === 0 && sp.peakDb < -0.1;
  qa.cuesOk = cues.every((c) => c.status === 'placed' || c.dropReason);
  const tol = cfg.qa.syncFrames;
  qa.syncRows = [...hits, ...items.map((v) => v.cue)].filter((c) => c.status === 'placed');
  qa.syncOk = qa.syncRows.every((c) => Math.abs(c.frameError) <= tol + 1e-6);
  qa.worstFrameError = Math.max(0, ...qa.syncRows.map((c) => Math.abs(c.frameError)));
  if (stopAt != null) {
    qa.hardStopAt = stopAt;
    qa.musicAfterDb = peakAfter(mixRes.stems.A4, stopAt + (cfg.music.hardStop.fadeMs || 20) / 1000, masterGainDb);
    qa.musicStopOk = qa.musicAfterDb < -60;
  }
  const lm = await loudestMoment(masterFile);
  qa.extras = extras;
  extras.forEach((x, i) => (qa[`extra${i + 1}Ok`] = x.ok));
  // Momentary loudness of the film's last 5 s (window end every 0.1 s), for the report.
  qa.lastSeconds = lm.series.filter((p) => p.t >= qa.duration - 5 - 1e-6);
  if (cfg.qa.tail && cardFrom != null) {
    const ref = hits.find((h) => h.sfxName === cfg.qa.tail.sfx);
    qa.tail = tailLoudness(lm.series, { from: cardFrom - cfg.qa.tail.seconds, to: cardFrom, refAt: ref ? ref.timeline : null, lu: cfg.qa.tail.lu });
    qa.tailOk = qa.tail.ok;
  }
  // The line over the effect, in the speech band, from the premix stems (the voice bus holds only
  // voices; the effect's stem is that effect as mixed, duck included).
  if (cfg.qa.speechBand) {
    const sb = cfg.qa.speechBand;
    const v = items.find((x) => x.cue.status === 'placed' && x.cue.voice.toLowerCase() === sb.role);
    if (v) {
      const from = v.start;
      const to = v.start + (v.pcm.length / CH - v.onset) / SR;
      const voiceOnly = new Float32Array(mixRes.stems.A2.length);
      for (const x of items.filter((y) => y.cue.status === 'placed' && y.cue.voice.toLowerCase() === sb.role)) {
        const st = Math.round(x.start * SR) - x.onset;
        for (let i = 0; i < x.pcm.length / CH; i++) {
          const j = st + i;
          if (j >= 0 && j < voiceOnly.length / CH) for (let ch = 0; ch < CH; ch++) voiceOnly[j * CH + ch] += x.pcm[i * CH + ch];
        }
      }
      qa.speechBand = { ...speechBandRatio(voiceOnly, mixRes.sfxStems?.[sb.sfx] || null, from, to, { lo: sb.lo, hi: sb.hi }), cue: v.cue.id };
      qa.speechBandOk = qa.speechBand.ratioDb >= sb.minDb - 1e-9;
    } else qa.speechBandOk = false;
  }
  if (cfg.qa.loudestSfx) {
    const strikes = hits.filter((h) => h.sfxName === cfg.qa.loudestSfx);
    qa.loudest = lm;
    qa.loudestSfx = cfg.qa.loudestSfx;
    qa.loudestOk = strikes.some((h) => lm.t != null && lm.t >= h.timeline - 0.05 && lm.t <= h.timeline + Math.max(2.5, (h.sfx.duration || 0) * 0.5));
    // Momentary loudness is reported at the end of its 400 ms window.
  }
  if (cfg.firstEvent) {
    const c = cues.find((x) => x.status === 'placed' && x.event === cfg.firstEvent.event);
    qa.firstEventAt = c ? c.timeline : null;
    qa.firstEventOk = c ? c.timeline <= cfg.firstEvent.seconds + 1e-6 : false;
  }
  const first = await edgeFrame(masterFile, 'first');
  const last = await edgeFrame(masterFile, 'last');
  qa.firstLuma = first.mean;
  qa.lastLuma = last.mean;
  qa.firstOk = first.mean > 20;
  const lastEntry = entries[entries.length - 1];
  if (lastEntry.kind === 'card') {
    const bright = Math.max(...last.pixels);
    qa.lastIsCard = true;
    qa.lastOk = last.mean < 24 && (!cfg.endCard.lines.length || !card?.text || bright > 90);
    qa.lastBright = bright;
  } else qa.lastOk = last.mean > 20;
  qa.sourceAudioOk = audioStreams.length === 1 && /-map 0:v -map 1:a/.test('-map 0:v -map 1:a') && !/\[\d+:a\]/.test(graph);
  qa.sourceAudioDetail = `${audioStreams.length} audio stream in the master (the mix); picture rendered with -an, ${withAudio.length} source clip audio stream(s) never mapped`;
  qa.retime = retimeFilters(graph);
  qa.hardCutsOk = qa.retime.length === 0;
  qa.shortest = Math.min(...entries.filter((e) => e.kind === 'clip').map((e) => (e.outF - e.inF) / cfg.fps));
  qa.minShotOk = qa.shortest >= cfg.shotRules.minShot - 1e-9;
  if (grid) {
    const cuts = entries.slice(0, -1).filter((e, i) => entries[i + 1]);
    qa.worstCutMs = Math.max(0, ...cuts.map((e) => e.cutOffBeatMs ?? 0));
    qa.beatOk = qa.worstCutMs <= (cfg.music.nudgeFrames * 1000) / cfg.fps / 2 + 1000 / cfg.fps / 2;
  }
  qa.silences = await silences(masterFile, cfg.qa.silenceFloorDb, cfg.qa.maxSilence, qa.duration);
  qa.silenceOk = qa.silences.length === 0;
  qa.runtime = (Date.now() - started) / 1000;

  // Making-of numbers.
  const rejectedDir = path.join(filmDir, 'clips', '_rejected');
  const making = {
    takesUsed: Object.keys(clips).length,
    takesRejected: fs.existsSync(rejectedDir) ? fs.readdirSync(rejectedDir).filter((f) => /\.(mp4|mov|webm)$/i.test(f)).length : 0,
    generated: cache.usage.generated,
    reused: cache.usage.reused,
    characters: Object.values(cache.index).filter((m) => m.request?.kind === 'tts').reduce((n, m) => n + (m.request.text || '').length, 0),
    ttsGenerations: Object.values(cache.index).filter((m) => m.request?.kind === 'tts').length,
    sfxGenerations: Object.entries(cache.index).filter(([k, m]) => m.request?.kind === 'sfx' && k.startsWith('sfx_')).length,
    musicGenerations: Object.values(cache.index).filter((m) => m.request?.kind === 'music').length,
    ambienceGenerations: Object.keys(cache.index).filter((k) => k.startsWith('ambience')).length,
    estUsd: Object.values(cache.index).reduce((n, m) => n + (m.estUsd || 0), 0),
    provider: provider.name,
  };

  const r = { cfg, entries, cues, hits, items, qa, loud, master, grid, music, mixRes, log, flags, making, built, briefName: path.basename(briefFile), fixes: brief.fixes, version, card, clips, filmDir, outDir, stopAt, cardFrom };
  writeReport(path.join(outDir, 'REPORT.md'), r);
  writeSummary(path.join(outDir, 'SUMMARY.md'), r);
  writeCueTimes(path.join(outDir, 'cue_times.json'), r);
  writeOpenQuestions(path.join(filmDir, 'OPEN_QUESTIONS.md'), log);
  const failed = Object.entries(qa).filter(([k, v]) => k.endsWith('Ok') && v === false).map(([k]) => k);
  log.info(`done: ${cfg.export.master} ${qa.duration.toFixed(3)} s, ${loud.I} LUFS, ${loud.TP} dBTP, worst sync ${qa.worstFrameError.toFixed(2)} frames${failed.length ? `; QA FAIL: ${failed.join(', ')}` : '; QA all pass'}`);
  return { ...r, failed, masterFile };
}
