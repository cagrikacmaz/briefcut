// Voice rules. Every line is placed with its onset on its cue frame, then:
//  0. A non-lead line's non-verbal lead-in (the laugh before its first word) is kept to maxLeadIn,
//     and pauses between words longer than maxInnerPause are cut to keepPause.
//  1. Caps count from the onset. A cap never truncates: a take over its cap gets up to
//     capRetakes more takes and the shortest natural one that fits wins; if none fits, the
//     shortest runs long and is logged.
//  2. Lead lines wait only for their own previous line plus overlapGap, at most maxLeadDelay;
//     past that the earlier lead line is cut at a word boundary (after trying retakes).
//  3. Lines of different speakers overlap at most maxOverlap: the later line waits within its
//     budget, the earlier line's tail is trimmed, a non-lead line that still collides is cut in
//     the gap before the colliding word, and what is left sits lower as a whole line.
//  4. Protected windows (the first seconds of a named hit) are never covered by a line.
//  5. With fitLineToScene, a line that would run past the end of its shot starts earlier, never
//     before its floor; what still does not fit is reported for the edit to extend the shot.
import { SR, CH, undb } from './util.mjs';
import { endAt, peakOf, scaleTo, trimOnset, loadAudio } from './assets.mjs';

const clipStart = (v) => v.start - v.onset / SR;
const clipEnd = (v) => clipStart(v) + v.duration;
const voicedLen = (v) => v.duration - v.onset / SR;

export async function loadVoice(file, peakDb, gateDb = -32) {
  return trimOnset(await loadAudio(file), { peakDb, gateDb });
}

export function capFor(c, R) {
  if (R.lineCaps?.[c.text] != null) return R.lineCaps[c.text];
  if (c.role === 'support' || c.role === 'layer') return c.nonVerbal ? R.supportNonVerbalCap : R.supportVerbalCap;
  return c.singleWord ? R.leadSingleWordCap : null;
}

// Word timings relative to the voice onset (forced alignment), or null.
async function wordsOf(v, store) {
  const onsetSrc = (v.srcStart + v.onset) / SR;
  const words = await store.words(v).catch(() => null);
  const shift = (t) => t - (v.edits || []).reduce((s, e) => s + (e.atSrc < t ? e.removed : 0), 0);
  return words ? words.filter((w) => String(w.text).trim()).map((w) => ({ text: String(w.text).trim(), start: shift(w.start) - onsetSrc, end: shift(w.end) - onsetSrc })) : null;
}

async function tightenPauses(v, cfg, store, log) {
  const R = cfg.voiceRules;
  if (!R.maxInnerPause) return;
  const words = await wordsOf(v, store);
  if (!words || words.length < 2) return;
  const onsetSrc = (v.srcStart + v.onset) / SR;
  const f = Math.round(0.01 * SR);
  for (let k = words.length - 2; k >= 0; k--) {
    const gap = words[k + 1].start - words[k].end;
    if (gap <= R.maxInnerPause) continue;
    const from = words[k].end + R.keepPause / 2;
    const to = words[k + 1].start - R.keepPause / 2;
    const s = v.onset + Math.round(from * SR);
    const e = v.onset + Math.round(to * SR);
    if (e >= v.pcm.length / CH || s - f < 0) continue;
    for (let i = 0; i < f; i++) {
      for (let c = 0; c < CH; c++) {
        v.pcm[(s - f + i) * CH + c] *= 1 - i / f;
        v.pcm[(e + i) * CH + c] *= i / f;
      }
    }
    const out = new Float32Array(v.pcm.length - (e - s) * CH);
    out.set(v.pcm.subarray(0, s * CH));
    out.set(v.pcm.subarray(e * CH), s * CH);
    v.pcm = out;
    const removed = (e - s) / SR;
    v.duration -= removed;
    v.speechEnd -= removed;
    (v.edits ||= []).push({ atSrc: onsetSrc + from, removed });
    v.cue.notes.push(`pause after "${words[k].text}" ${gap.toFixed(2)}→${R.keepPause.toFixed(2)} s`);
    log.info(`cue ${v.cue.id}: pause after "${words[k].text}" shortened from ${gap.toFixed(2)} to ${R.keepPause} s`);
  }
}

async function shortenLeadIn(v, cfg, store, log) {
  const R = cfg.voiceRules;
  const maxLeadIn = v.cue.leadIn ?? R.maxLeadIn;
  if (maxLeadIn == null || (v.cue.role === 'lead' && v.cue.leadIn == null) || v.cue.nonVerbal) return;
  const words = await wordsOf(v, store);
  if (!words?.length || words[0].start <= maxLeadIn + 0.02) return;
  const skip = words[0].start - maxLeadIn;
  const n = Math.round(skip * SR);
  v.pcm = v.pcm.slice(n * CH);
  const fadeN = v.onset + Math.round(0.02 * SR);
  for (let i = 0; i < Math.min(fadeN, v.pcm.length / CH); i++) for (let c = 0; c < CH; c++) v.pcm[i * CH + c] *= i / fadeN;
  scaleTo(v.pcm, undb(cfg.levels.voicePeak) / Math.max(1e-9, peakOf(v.pcm)));
  v.srcStart += n;
  v.duration -= n / SR;
  v.speechEnd -= n / SR;
  v.cue.notes.push(`lead-in before "${words[0].text}" ${words[0].start.toFixed(2)}→${maxLeadIn.toFixed(2)} s`);
  log.info(`cue ${v.cue.id}: lead-in shortened from ${words[0].start.toFixed(2)} to ${maxLeadIn} s`);
}

async function altTake(v, n, reason, cfg, store, log) {
  const got = await store.retake(v.cue, n, reason);
  const alt = { ...(await loadVoice(got.file, cfg.levels.voicePeak, cfg.voiceRules.gateDb)), name: got.name, file: got.file, spoken: got.spoken, cue: v.cue };
  await shortenLeadIn(alt, cfg, store, log);
  await tightenPauses(alt, cfg, store, log);
  return alt;
}

async function cutLead(A, latestEnd, cfg, store, log) {
  const R = cfg.voiceRules;
  const c = A.cue;
  const limit = latestEnd - A.start;
  let words = await wordsOf(A, store);
  const lastWordEnd = (w, v) => (w?.length ? w[w.length - 1].end : v.speechEnd - v.onset / SR);
  if (lastWordEnd(words, A) > limit + 1e-3) {
    for (let n = 1; n <= (R.capRetakes ?? 2); n++) {
      const alt = await altTake(A, n, `its words must end ${limit.toFixed(2)} s after the onset`, cfg, store, log);
      const altWords = await wordsOf(alt, store);
      if (lastWordEnd(altWords, alt) > limit + 1e-3) continue;
      const start = A.start;
      Object.assign(A, alt, { start });
      c.notes.push(`take ${alt.name}: words end in time, no word cut`);
      words = altWords;
      break;
    }
  }
  let bounds = [];
  if (words) for (let k = 0; k + 1 < words.length; k++) bounds.push((words[k].end + words[k + 1].start) / 2);
  else bounds = A.gateBoundaries || [];
  const fit = bounds.filter((b) => b > 0 && b <= limit);
  const gapAt = words ? words.findIndex((w, k) => w.end <= limit && (k + 1 === words.length || limit <= words[k + 1].start)) : -1;
  let at = gapAt >= 0 ? limit : fit.length ? Math.max(...fit) : limit;
  if (at <= 0.05) at = 0.05;
  const lost = words ? words.filter((w) => w.start >= at - 1e-3).map((w) => w.text).join(' ') : null;
  const removed = endAt(A, A.onset / SR + at, R.cutFadeMs, cfg.levels.voicePeak);
  const what = `cut ${at.toFixed(3)} s after its onset (${gapAt >= 0 || fit.length ? 'word boundary' : 'no boundary early enough: hard cut'}), removed ${removed.toFixed(3)} s${lost ? `: "${lost}"` : ''}`;
  c.notes.push(what);
  log.assume('lead cut', `cue ${c.id} "${c.text}": ${what}`);
}

// items: [{ cue, pcm, onset, duration, ... }] with cue.pictureTime / cue.target set.
// ctx: { protect: [{ from, to, label }], shotEnd(cue) -> seconds, floor(cue) -> seconds }
export async function applyVoiceRules(items, cfg, duration, store, log, ctx = {}) {
  const R = cfg.voiceRules;
  const fps = cfg.fps;
  const peak = cfg.levels.voicePeak;
  for (const v of items) {
    v.cue.notes ||= [];
    v.start = v.cue.target;
  }
  for (const v of items) {
    await shortenLeadIn(v, cfg, store, log);
    await tightenPauses(v, cfg, store, log);
  }

  // Caps.
  for (const v of items) {
    const c = v.cue;
    const cap = capFor(c, R);
    if (cap == null || voicedLen(v) <= cap) continue;
    const takes = [v];
    for (let n = 1; n <= (R.capRetakes ?? 2) && !takes.some((t) => voicedLen(t) <= cap); n++) takes.push(await altTake(v, n, `${voicedLen(v).toFixed(2)} s is over the ${cap} s cap`, cfg, store, log));
    const fits = takes.filter((t) => voicedLen(t) <= cap);
    const best = (fits.length ? fits : takes).sort((a, b) => voicedLen(a) - voicedLen(b))[0];
    const was = voicedLen(v);
    if (best !== v) {
      const start = v.start;
      Object.assign(v, best, { start });
      c.notes.push(`take ${best.name}: ${voicedLen(v).toFixed(2)} s, shortest of ${takes.length} (first ${was.toFixed(2)} s)`);
    }
    if (voicedLen(v) > cap) log.assume('cap', `cue ${c.id} "${c.text}": no take of ${takes.length} fits the ${cap} s cap; the shortest (${voicedLen(v).toFixed(2)} s) runs long, untruncated`);
  }

  // Protected windows: a line that would start inside one starts at its end.
  for (const v of items) {
    for (const p of ctx.protect || []) {
      if (v.start >= p.from - 1e-6 && v.start < p.to) {
        log.assume('protected window', `cue ${v.cue.id} "${v.cue.text}" would start ${(v.start - p.from).toFixed(2)} s into ${p.label}; moved to ${p.to.toFixed(3)} s`);
        v.cue.notes.push(`moved out of ${p.label} (+${(p.to - v.start).toFixed(2)} s)`);
        v.start = p.to;
      }
    }
  }

  // Lead chain.
  const leads = items.filter((v) => v.cue.role === 'lead');
  const leadChain = async () => {
    leads.sort((a, b) => a.start - b.start);
    for (let i = 1; i < leads.length; i++) {
      const [A, B] = [leads[i - 1], leads[i]];
      const need = clipEnd(A) + R.overlapGap - B.start;
      if (need <= 1e-6) continue;
      const maxDelayF = Math.max(0, Math.floor((R.maxLeadDelay - (B.start - B.cue.target)) * fps + 1e-6));
      let delayF = Math.ceil(need * fps - 1e-6);
      if (delayF > maxDelayF) {
        await cutLead(A, B.start + maxDelayF / fps - R.overlapGap, cfg, store, log);
        delayF = Math.max(0, Math.ceil((clipEnd(A) + R.overlapGap - B.start) * fps - 1e-6));
      }
      if (delayF) {
        B.start += delayF / fps;
        B.cue.notes.push(`delayed +${(delayF / fps).toFixed(3)} s after cue ${A.cue.id}`);
      }
    }
  };
  await leadChain();

  // Overlap control between different speakers.
  const budget = (v) => (v.cue.role === 'lead' ? R.maxLeadDelay : R.maxSupportDelay) - (v.start - v.cue.target);
  for (const B of items) {
    for (const A of items) {
      if (A === B || A.cue.voice === B.cue.voice || A.start > B.start || (A.start === B.start && A.cue.row > B.cue.row)) continue;
      if (clipEnd(A) <= B.start + R.maxOverlap + 1e-6) continue;
      const len = voicedLen(A);
      const words = (await wordsOf(A, store))?.filter((w) => w.start < len - 0.02);
      const lastEnd = words?.length ? A.start + Math.min(len, Math.max(...words.map((w) => w.end))) : A.start + (A.speechEnd - A.onset / SR);
      if (lastEnd > B.start + R.maxOverlap) {
        const needF = Math.ceil((lastEnd - R.maxOverlap - B.start) * fps - 1e-6);
        const dF = Math.min(needF, Math.floor(Math.max(0, budget(B)) * fps + 1e-6));
        if (dF > 0) {
          B.start += dF / fps;
          B.cue.notes.push(`waits +${(dF / fps).toFixed(3)} s for the words of cue ${A.cue.id}`);
        }
      }
      const limit = B.start + R.maxOverlap;
      if (clipEnd(A) <= limit + 1e-6) continue;
      if (lastEnd <= limit + 1e-6) {
        const removed = endAt(A, A.onset / SR + (limit - A.start), R.capFadeMs, peak);
        A.cue.notes.push(`tail after its last word trimmed for cue ${B.cue.id} (−${removed.toFixed(2)} s)`);
        continue;
      }
      const first = words?.find((w) => A.start + w.end > limit + 1e-3);
      if (A.cue.role !== 'lead' && first && first.start > 0.1 && !A.cue.keepWords) {
        const at = Math.min(limit - A.start, first.start);
        const lost = words.filter((w) => w.start >= first.start - 1e-3).map((w) => w.text).join(' ');
        endAt(A, A.onset / SR + at, R.cutFadeMs, peak);
        A.cue.notes.push(`cut before "${lost}" for cue ${B.cue.id}`);
        log.assume('overlap', `cue ${A.cue.id}: cut in the gap before "${lost}" so cue ${B.cue.id} is not talked over`);
      } else {
        (A.overlaps ||= []).push(B.cue.id);
      }
    }
  }
  await leadChain();

  // A line that still overlaps another speaker sits lower as a whole line (one constant gain).
  for (const v of items) {
    if (v.cue.role === 'lead') continue;
    const hit = items.some((u) => u !== v && u.cue.voice !== v.cue.voice && clipStart(u) < clipEnd(v) - 0.005 && clipStart(v) < clipEnd(u) - 0.005);
    if (hit && v.overlapGainDb == null) {
      scaleTo(v.pcm, undb(R.supportOverlapDb));
      v.overlapGainDb = R.supportOverlapDb;
      v.cue.notes.push(`whole line ${R.supportOverlapDb} dB (overlaps another speaker)`);
    }
  }

  // Fit a line inside its shot: start earlier down to its floor; report what still runs over.
  for (const v of items) {
    v.runsOver = 0;
    if (!R.fitLineToScene || !ctx.shotEnd) continue;
    const end = ctx.shotEnd(v.cue);
    const over = clipEnd(v) - end;
    if (over <= 1e-3) continue;
    const floor = Math.max(ctx.floor ? ctx.floor(v.cue) : v.cue.target, ...(ctx.protect || []).filter((p) => p.to <= v.start + 1e-6 && p.to > v.start - 5).map((p) => p.to));
    const shift = Math.min(over, Math.max(0, v.start - floor));
    if (shift > 1e-3) {
      v.start -= shift;
      v.cue.notes.push(`starts ${shift.toFixed(3)} s earlier to end inside its shot`);
      log.assume('fit line', `cue ${v.cue.id} "${v.cue.text}" started ${shift.toFixed(3)} s earlier to end inside its shot (floor ${floor.toFixed(3)} s)`);
    }
    v.runsOver = Math.max(0, clipEnd(v) - end);
  }

  for (const v of items) {
    const c = v.cue;
    c.timeline = v.start;
    c.delay = v.start - c.target;
    c.length = voicedLen(v);
    v.end = clipEnd(v);
    if (v.start >= duration - 0.2) {
      c.status = 'dropped';
      c.dropReason = `starts at ${v.start.toFixed(3)} s, after the end of the film`;
      log.warn(`cue ${c.id}: ${c.dropReason}`);
    }
  }
}
