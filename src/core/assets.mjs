// Generated-asset cache and the audio clean-up every asset goes through before the mix.
//
// Cache rule: a paid generation is made once. Each file in <film>/audio/ is recorded in
// audio/index.json with the fingerprint of the request that made it (provider, model, voice,
// text as sent, settings, prompt, seconds). The same request is always served from disk. A
// changed request never overwrites the old file: it is generated under <name>_v2, _v3 ...
import fs from 'node:fs';
import path from 'node:path';
import { decode } from './ff.mjs';
import { SR, CH, ensureDir, exists, readJson, writeJson, sha1, undb, db } from './util.mjs';

const frames = (pcm) => pcm.length / CH;

export class AssetCache {
  constructor(dir, { log, offline = false, maxSpend = null, priceOf = () => 0 } = {}) {
    this.dir = ensureDir(dir);
    this.log = log;
    this.offline = offline;
    this.maxSpend = maxSpend;
    this.priceOf = priceOf;
    this.indexFile = path.join(dir, 'index.json');
    this.index = readJson(this.indexFile, {});
    this.usage = { generated: [], reused: 0, spentUsd: 0 };
  }

  // `request` is a plain object; its JSON (sorted keys) is the fingerprint. `make()` returns
  // { buf, ext } and runs only on a cache miss.
  async get(name, request, make) {
    const fingerprint = sha1(stableJson(request));
    for (let v = 1; ; v++) {
      const base = v === 1 ? name : `${name}_v${v}`;
      const hit = Object.keys(this.index).find((k) => k.replace(/\.[^.]+$/, '') === base);
      if (!hit) {
        if (v > 1) this.log?.assume('cache', `${name}: the request changed since it was generated; the new take is ${base} and the old file is kept`);
        return this.#generate(base, request, fingerprint, make);
      }
      if (this.index[hit].fingerprint === fingerprint && exists(path.join(this.dir, hit))) {
        this.usage.reused++;
        return { file: path.join(this.dir, hit), name: hit, cached: true, meta: this.index[hit] };
      }
      if (this.index[hit].fingerprint === fingerprint) return this.#generate(base, request, fingerprint, make);
    }
  }

  async #generate(base, request, fingerprint, make) {
    if (this.offline) throw new Error(`offline: ${base} is not in the cache (${path.basename(this.dir)}/index.json); run without --offline to generate it`);
    const cost = this.priceOf(request);
    if (this.maxSpend != null && this.usage.spentUsd + cost > this.maxSpend + 1e-9) {
      throw new Error(`--max-spend ${this.maxSpend} USD: generating ${base} (~${cost.toFixed(3)} USD) would bring this run to ${(this.usage.spentUsd + cost).toFixed(3)} USD; nothing was sent`);
    }
    const { buf, ext = 'mp3', info = {} } = await make();
    const name = `${base}.${ext}`;
    fs.writeFileSync(path.join(this.dir, name), buf);
    this.usage.spentUsd += cost;
    const meta = { fingerprint, request: redact(request), ...info, estUsd: Number(cost.toFixed(4)), created: new Date().toISOString() };
    this.index[name] = meta;
    this.usage.generated.push({ name, request: meta.request, estUsd: cost });
    writeJson(this.indexFile, this.index);
    this.log?.info(`generated ${name}`);
    return { file: path.join(this.dir, name), name, cached: false, meta };
  }

  has(name) {
    return Object.keys(this.index).some((k) => k.replace(/\.[^.]+$/, '') === name);
  }
}

export function stableJson(x) {
  if (Array.isArray(x)) return `[${x.map(stableJson).join(',')}]`;
  if (x && typeof x === 'object') return `{${Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(x[k])}`).join(',')}}`;
  return JSON.stringify(x);
}

// Requests are stored for the record; nothing secret is ever part of one, but a field that
// looks like a credential is dropped anyway.
function redact(req) {
  return Object.fromEntries(Object.entries(req).filter(([k]) => !/key|token|secret|auth/i.test(k)));
}

// ---------- audio clean-up ----------

export function peakOf(pcm) {
  let p = 0;
  for (let i = 0; i < pcm.length; i++) p = Math.max(p, Math.abs(pcm[i]));
  return p;
}

export function rmsOf(pcm, from = 0, to = pcm.length / CH) {
  let s = 0;
  for (let i = from * CH; i < to * CH; i++) s += pcm[i] * pcm[i];
  return Math.sqrt(s / Math.max(1, (to - from) * CH));
}

export function scaleTo(pcm, gain) {
  for (let i = 0; i < pcm.length; i++) pcm[i] *= gain;
  return pcm;
}

export function fade(pcm, inSamples, outSamples) {
  const n = frames(pcm);
  for (let i = 0; i < Math.min(inSamples, n); i++) {
    const g = i / inSamples;
    for (let c = 0; c < CH; c++) pcm[i * CH + c] *= g;
  }
  for (let i = 0; i < Math.min(outSamples, n); i++) {
    const g = i / outSamples;
    const k = n - 1 - i;
    for (let c = 0; c < CH; c++) pcm[k * CH + c] *= g;
  }
  return pcm;
}

function rmsEnvelope(pcm, w = Math.round(0.01 * SR)) {
  const n = frames(pcm);
  const rms = [];
  for (let i = 0; i < n; i += w) {
    let s = 0;
    const end = Math.min(n, i + w);
    for (let j = i; j < end; j++) for (let c = 0; c < CH; c++) s += pcm[j * CH + c] ** 2;
    rms.push(Math.sqrt(s / (CH * (end - i))));
  }
  return { rms, w };
}

// TTS and generated audio carry leading silence (often 0.1-0.4 s) and breath or room tails.
// Without this trim a cue placed at "event time" starts its sound late by that silence.
// Voice clip: trimmed to the gated speech (10 ms RMS envelope, gateDb under the loudest window),
// 30 ms pre-roll, 80 ms faded tail, peak-normalized. `onset` = samples from the buffer start to
// where the voice starts; place the buffer at (cue time - onset).
export function trimOnset(pcm, { peakDb = null, gateDb = -32, preRoll = 0.03, tail = 0.08 } = {}) {
  const n = frames(pcm);
  const { rms, w } = rmsEnvelope(pcm);
  const thr = Math.max(...rms) * undb(gateDb);
  const firstWin = rms.findIndex((r) => r >= thr);
  const lastWin = rms.length - 1 - [...rms].reverse().findIndex((r) => r >= thr);
  // Refine the onset inside its 10 ms window to the first sample above the gate.
  let first = firstWin * w;
  const sThr = thr * 1.4;
  for (let i = first; i < Math.min(n, first + w); i++) {
    if (Math.max(...Array.from({ length: CH }, (_, c) => Math.abs(pcm[i * CH + c]))) >= sThr) {
      first = i;
      break;
    }
  }
  const last = Math.min(n - 1, (lastWin + 1) * w);
  const start = Math.max(0, first - Math.round(preRoll * SR));
  const end = Math.min(n, last + Math.round(tail * SR));
  const out = fade(pcm.slice(start * CH, end * CH), Math.round(0.005 * SR), Math.round(tail * SR));
  if (peakDb != null) scaleTo(out, undb(peakDb) / Math.max(1e-9, peakOf(out)));
  const gaps = [];
  for (let i = firstWin + 1; i < lastWin; i++) {
    if (rms[i] >= thr) continue;
    let j = i;
    while (j < lastWin && rms[j] < thr) j++;
    if (j - i >= 5) gaps.push((((i + j) / 2) * w - first) / SR);
    i = j;
  }
  return { pcm: out, onset: first - start, srcStart: start, leadingSilence: first / SR, duration: (end - start) / SR, speech: (last - first) / SR, speechEnd: (last - start) / SR, gateBoundaries: gaps };
}

// Hits (taps, clicks, strikes): the main transient goes `lead` seconds (3 ms) into the file.
// Everything before the onset of that transient goes, the tail ends where it falls 45 dB under
// the peak (or at maxSeconds), 3 ms / 30 ms fades. `onset` = samples to the transient start.
export function trimTransient(pcm, { peakDb = null, lead = 0.003, floorDb = -45, maxSeconds = null } = {}) {
  const n = frames(pcm);
  let p = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.max(Math.abs(pcm[i * CH]), Math.abs(pcm[i * CH + 1]));
    if (v > peak) ((peak = v), (p = i));
  }
  // The transient's start: the first sample within 20 dB of the peak in the 80 ms before it.
  let on = p;
  for (let i = Math.max(0, p - Math.round(0.08 * SR)); i < p; i++) {
    if (Math.max(Math.abs(pcm[i * CH]), Math.abs(pcm[i * CH + 1])) >= peak * undb(-20)) {
      on = i;
      break;
    }
  }
  let end = n - 1;
  while (end > p && Math.max(Math.abs(pcm[end * CH]), Math.abs(pcm[end * CH + 1])) < peak * undb(floorDb)) end--;
  const start = Math.max(0, on - Math.round(lead * SR));
  let stop = Math.min(n, end + Math.round(0.01 * SR));
  if (maxSeconds) stop = Math.min(stop, start + Math.round(maxSeconds * SR));
  const out = pcm.slice(start * CH, stop * CH);
  const m = frames(out);
  const fi = Math.round(0.003 * SR);
  const fo = Math.min(Math.round(0.03 * SR), Math.floor(m / 2));
  for (let i = 0; i < m; i++) {
    let g = 1;
    if (i < Math.min(fi, on - start)) g = i / Math.max(1, Math.min(fi, on - start));
    if (i >= m - fo) g = Math.min(g, (m - 1 - i) / fo);
    for (let c = 0; c < CH; c++) out[i * CH + c] *= g;
  }
  if (peakDb != null) scaleTo(out, undb(peakDb) / Math.max(1e-9, peakOf(out)));
  return { pcm: out, onset: on - start, leadingSilence: on / SR, peakAt: (p - start) / SR, duration: m / SR };
}

// End a clip at `at` seconds (clip time) with a fade that finishes there; returns seconds removed.
export function endAt(v, at, fadeMs, peakDb = null) {
  const n = Math.min(frames(v.pcm), Math.round(at * SR));
  if (n >= frames(v.pcm)) return 0;
  const removed = v.duration - n / SR;
  v.pcm = fade(v.pcm.slice(0, n * CH), 0, Math.round((fadeMs / 1000) * SR));
  v.duration = n / SR;
  v.speechEnd = Math.min(v.speechEnd ?? v.duration, v.duration);
  if (peakDb != null) scaleTo(v.pcm, undb(peakDb) / Math.max(1e-9, peakOf(v.pcm)));
  return removed;
}

export async function loadAudio(file) {
  return decode(file, { sr: SR, ch: CH });
}

// eleven_v3 rejects text made only of audio tags ("[giggles]"): such a line gets a short
// vocalization of its last tag so the performance stays the same.
const VOCALIZE = { giggles: 'Hehehe!', giggle: 'Hehehe!', laughs: 'Hahaha!', laugh: 'Hahaha!', chuckles: 'Heh heh!', gasps: 'Oh!', sighs: 'Hmm.' };
export function speakableText(text) {
  if (text.replace(/\[[^\]]*\]/g, '').trim()) return text;
  const tags = [...text.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim().toLowerCase());
  return `${text} ${VOCALIZE[tags[tags.length - 1]] || 'Mmm!'}`.trim();
}

// Pronunciation map: respellings applied only to the text sent to TTS. Whole words,
// case-insensitive, punctuation kept, [tags] untouched. Reports keep the original spelling.
// Read from <film>/pronunciations.json ({ "entries": [{ "word": "...", "say": "..." }] }).
export function loadPronunciations(file) {
  return readJson(file, { entries: [] }).entries || [];
}

export function applyPronunciations(text, entries) {
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matchCase = (found, say) => {
    if (found === found.toUpperCase() && found !== found.toLowerCase()) return say.toUpperCase();
    if (found[0] === found[0].toLowerCase()) return say[0].toLowerCase() + say.slice(1);
    return say;
  };
  return text
    .split(/(\[[^\]]*\])/)
    .map((part) => (part.startsWith('[') ? part : entries.reduce((s, e) => s.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(e.word)}(?![\\p{L}\\p{N}])`, 'giu'), (m) => matchCase(m, e.say)), part)))
    .join('');
}

export const dbfs = (x) => db(x);
