// Audio preparation: every voice line, SFX variant, music take and the ambience, through the
// cache. Requests are enumerated first (the same list feeds `briefcut estimate`), so nothing is
// paid for that the estimate did not show.
import fs from 'node:fs';
import path from 'node:path';
import { applyPronunciations, loadPronunciations, speakableText, loadAudio } from './assets.mjs';
import { sfxRequests } from './sfx.mjs';
import { detectBeats, tempoSteadiness, monoOf } from './beats.mjs';
import { SR, readJson, writeJson, exists } from './util.mjs';

export const voiceAsset = (c, n = 0) => `vo_${c.row}_${c.voice.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')}${n ? `_r${n}` : ''}`;

// The text a line is sent with: tag-only lines get a vocalization (v3 refuses them), then the
// film's pronunciation map. The brief keeps the original.
export function sentText(c, cfg, pron) {
  return applyPronunciations(speakableText(c.text), pron);
}

export function plannedRequests(cfg, providerName, { filmDir, voices = {} } = {}) {
  const pron = loadPronunciations(path.join(filmDir || '.', 'pronunciations.json'));
  const out = [];
  const seen = new Set();
  for (const c of cfg.cues.filter((x) => x.kind === 'voice')) {
    if (seen.has(c.row)) continue;
    seen.add(c.row);
    const role = cfg.tts.roles[c.voice.toLowerCase()];
    const v = voices[c.voice.toLowerCase()];
    out.push({ asset: voiceAsset(c), cue: c, request: { kind: 'tts', provider: providerName, voice: v?.name ?? role.candidates[0] ?? c.voice, model: role.model, settings: role.settings, text: sentText(c, cfg, pron) } });
  }
  for (const s of sfxRequests(cfg, providerName)) out.push({ asset: s.asset, sfx: s, request: s.request });
  if (cfg.music.enabled) {
    for (let k = 1; k <= cfg.music.takes; k++) out.push({ asset: `music_take${k}`, take: k, request: { kind: 'music', provider: providerName, prompt: cfg.music.prompt, seconds: cfg.music.seconds, take: k } });
  }
  if (cfg.ambience.enabled) out.push({ asset: 'ambience', ambience: true, request: { kind: 'sfx', provider: providerName, prompt: cfg.ambience.prompt, seconds: Math.min(30, cfg.ambience.seconds), loop: true } });
  return out;
}

// Voices by name: for every role, the first candidate that exists in the account.
export async function resolveVoices(cfg, provider, log) {
  const out = {};
  for (const c of cfg.cues.filter((x) => x.kind === 'voice')) {
    const key = c.voice.toLowerCase();
    if (out[key]) continue;
    const role = cfg.tts.roles[key];
    const cands = role.candidates.length ? role.candidates : [c.voice];
    const v = await provider.resolveVoice(cands);
    out[key] = v;
    const msg = `${c.voice}: used voice "${v.name}"${cands.length > 1 ? ` (candidate ${v.rank} of ${cands.length}: ${cands.join(', ')})` : ''}`;
    if (v.rank > 1) log.assume('voices', msg);
    else log.info(msg);
  }
  return out;
}

export async function prepareAudio({ cfg, filmDir, provider, cache, log, voices = null }) {
  const vmap = voices || (cfg.cues.some((c) => c.kind === 'voice') ? await resolveVoices(cfg, provider, log) : {});
  const plan = plannedRequests(cfg, provider.name, { filmDir, voices: vmap });
  const got = { voices: {}, sfx: [], music: [], ambience: null, voiceIds: vmap };
  for (const p of plan) {
    const r = p.request;
    let res;
    if (r.kind === 'tts') {
      const v = vmap[p.cue.voice.toLowerCase()];
      res = await cache.get(p.asset, r, () => provider.tts({ voiceId: v.id, text: r.text, model: r.model, settings: r.settings, asset: p.asset }));
      got.voices[p.cue.row] = { ...res, spoken: r.text, voice: v };
    } else if (p.sfx) {
      res = await cache.get(p.asset, r, () => provider.sfx({ prompt: r.prompt, seconds: r.seconds, variant: r.variant, asset: p.asset }));
      got.sfx.push({ name: p.sfx.name, variant: p.sfx.variant, file: res.file, assetName: res.name });
    } else if (r.kind === 'music') {
      res = await cache.get(p.asset, r, () => provider.music({ prompt: r.prompt, seconds: r.seconds, instrumental: true, asset: p.asset }));
      got.music.push({ take: p.take, file: res.file, name: res.name });
    } else if (p.ambience) {
      res = await cache.get(p.asset, r, () => provider.sfx({ prompt: r.prompt, seconds: r.seconds, loop: true, asset: p.asset }));
      got.ambience = { file: res.file, name: res.name };
    }
  }
  if (cfg.tts.align) {
    for (const [row, v] of Object.entries(got.voices)) await alignCached(v.file, v.spoken, provider, log, cache.offline).catch((e) => log.warn(`forced alignment for row ${row}: ${String(e.message).slice(0, 160)}; word timings fall back to the gate`));
  }
  return got;
}

// Forced alignment cached next to the take as <file>.align.json.
export async function alignCached(file, text, provider, log, offline = false) {
  const cacheFile = file.replace(/\.[^.]+$/, '.align.json');
  const hit = readJson(cacheFile);
  if (hit) return hit.words;
  if (offline) return null;
  const res = await provider.align(file, text.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim());
  if (!res) return null;
  writeJson(cacheFile, res);
  return res.words;
}

// The music take to use: with "pick: steadiest", the take whose local tempo varies least
// (6 s windows), ties broken by beat hit ratio. The grid is frozen next to the take.
export async function pickMusic(cfg, takes, log, audioDir) {
  const pickFile = path.join(audioDir, 'music_pick.json');
  const prev = readJson(pickFile);
  const names = takes.map((t) => t.name).join(',');
  if (prev && prev.takes === names && prev.files.every((f) => exists(path.join(audioDir, f.name)) && fs.statSync(path.join(audioDir, f.name)).size === f.bytes)) {
    log.info(`music: take ${prev.used} (frozen pick and grid, audio/music_pick.json)`);
    return prev;
  }
  const rows = [];
  for (const t of takes) {
    const pcm = await loadAudio(t.file);
    const mono = monoOf(pcm);
    const grid = detectBeats(mono, SR, { bpmHint: cfg.music.bpm, analyzeSeconds: Math.min(32, mono.length / SR) });
    const st = tempoSteadiness(mono, SR, grid);
    rows.push({ take: t.take, name: t.name, bytes: fs.statSync(t.file).size, seconds: mono.length / SR, grid, bpmStdDev: st.bpmStdDev, localBpm: st.localBpm.map((b) => Number(b.toFixed(2))), hitRatio: grid.beatHitRatio });
  }
  rows.sort((a, b) => a.bpmStdDev - b.bpmStdDev || b.hitRatio - a.hitRatio);
  const best = rows[0];
  const out = { used: best.take, name: best.name, grid: best.grid, takes: names, files: rows.map((r) => ({ name: r.name, bytes: r.bytes })), rows, rule: cfg.music.pick, decided: new Date().toISOString() };
  writeJson(pickFile, out);
  if (rows.length > 1) log.assume('music take', `take ${best.take} has the steadiest tempo (local BPM spread ${best.bpmStdDev.toFixed(2)} vs ${rows.slice(1).map((r) => `take ${r.take} ${r.bpmStdDev.toFixed(2)}`).join(', ')}); ${best.grid.bpm.toFixed(2)} BPM detected`);
  if (cfg.music.bpm && Math.abs(best.grid.bpm - cfg.music.bpm) > 3) log.assume('music tempo', `ordered ${cfg.music.bpm} BPM, detected ${best.grid.bpm.toFixed(2)}; the detected grid is used`);
  return out;
}
