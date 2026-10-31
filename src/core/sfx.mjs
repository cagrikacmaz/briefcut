// Sound effects from the brief's `## SFX` table: one cached generation per variant, trimmed so the
// sound's start is known to the sample, then placed so that start lands on its cue's frame.
import { SR, CH } from './util.mjs';
import { loadAudio, trimTransient, trimOnset } from './assets.mjs';

export const sfxAssetName = (name, k) => `sfx_${name}_${k}`;

export function sfxRequests(cfg, provider) {
  const out = [];
  for (const s of Object.values(cfg.sfx)) {
    for (let k = 1; k <= s.variants; k++) {
      out.push({ name: s.name, variant: k, asset: sfxAssetName(s.name, k), request: { kind: 'sfx', provider, prompt: s.prompt, seconds: s.seconds, variant: k } });
    }
  }
  return out;
}

// Trim mode from the table: "transient" (main hit 3 ms into the file), "onset" (gated start of a
// softer sound), "none" (file start).
export function prepareSfx(pcm, spec, peakDb) {
  if (spec.trim === 'none') return { pcm, onset: 0, leadingSilence: 0, duration: pcm.length / CH / SR };
  if (spec.trim === 'onset') {
    const t = trimOnset(pcm, { peakDb, gateDb: -30, preRoll: 0.005, tail: 0.15 });
    return { pcm: t.pcm, onset: t.onset, leadingSilence: t.leadingSilence, duration: t.duration };
  }
  const t = trimTransient(pcm, { peakDb });
  return { pcm: t.pcm, onset: t.onset, leadingSilence: t.leadingSilence, duration: t.duration };
}

// Holds a ringing take's decay: from `from` seconds after its loudest 50 ms window, the 50 ms RMS
// envelope may fall no faster than `rate` dB/s; quieter windows are lifted, by at most `maxLift`
// dB, so the take's own tail rings longer. The attack and the peak are untouched. The gain is
// interpolated between window centres and never falls once the lift has started, so the tail's
// own beating and fluctuations stay audible instead of being flattened.
export function holdDecay(pcm, { rate, from = 0.5, maxLift = 30 }) {
  const n = pcm.length / CH;
  const w = Math.round(0.05 * SR);
  const env = [];
  for (let i = 0; i < n; i += w) {
    let s = 0;
    const e = Math.min(n, i + w);
    for (let k = i; k < e; k++) s += pcm[k * CH] ** 2 + pcm[k * CH + 1] ** 2;
    env.push(10 * Math.log10(s / (CH * (e - i)) + 1e-20));
  }
  let kp = 0;
  for (let k = 1; k < env.length; k++) if (env[k] > env[kp]) kp = k;
  const k0 = kp + Math.round((from * SR) / w);
  const gains = env.map(() => 0);
  if (k0 < env.length) {
    const ref = env[k0];
    let g = 0;
    for (let k = k0; k < env.length; k++) {
      const target = ref - rate * (((k - k0) * w) / SR);
      g = Math.min(maxLift, Math.max(g, target - env[k]));
      gains[k] = g;
    }
  }
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < n; i++) {
    const x = i / w - 0.5;
    const k = Math.max(0, Math.min(env.length - 1, Math.floor(x)));
    const k2 = Math.min(env.length - 1, k + 1);
    const t = Math.max(0, Math.min(1, x - k));
    const g = 10 ** ((gains[k] * (1 - t) + gains[k2] * t) / 20);
    out[i * CH] = pcm[i * CH] * g;
    out[i * CH + 1] = pcm[i * CH + 1] * g;
  }
  return out;
}

export async function loadSfxVariants(cfg, files) {
  const out = {};
  for (const f of files) {
    const spec = cfg.sfx[f.name];
    const peak = cfg.levels.sfxPeakByName?.[f.name] ?? cfg.levels.sfxPeak;
    const p = prepareSfx(await loadAudio(f.file), spec, peak);
    const hold = cfg.levels.sfxHold?.[f.name];
    if (hold) p.pcm = holdDecay(p.pcm, hold);
    (out[f.name] ||= []).push({ ...p, variant: f.variant, file: f.file, asset: f.assetName, peakDb: peak });
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.variant - b.variant);
  return out;
}

// Variants rotate per effect in timeline order, and a hit never reuses the file the previous hit
// of the same effect used. Hits of one effect closer than `groupWindow` share one sound.
export function assignVariants(hits, variants, { groupWindow = 0 } = {}) {
  const sorted = [...hits].sort((a, b) => a.timeline - b.timeline);
  const next = {};
  const last = {};
  const lastTime = {};
  for (const h of sorted) {
    const list = variants[h.sfxName];
    if (!list?.length) continue;
    if (groupWindow && lastTime[h.sfxName] != null && h.timeline - lastTime[h.sfxName] < groupWindow) {
      h.status = 'dropped';
      h.dropReason = `within ${groupWindow} s of the previous ${h.sfxName}: one sound`;
      continue;
    }
    let k = (next[h.sfxName] ?? 0) % list.length;
    if (list.length > 1 && list[k].variant === last[h.sfxName]) k = (k + 1) % list.length;
    h.sfx = list[k];
    next[h.sfxName] = k + 1;
    last[h.sfxName] = list[k].variant;
    lastTime[h.sfxName] = h.timeline;
  }
  return sorted;
}
