// Edit decision list in frames: cue sheet reading, events and wildcards, shot rules, beat snap,
// and the mapping of source-frame events to the timeline. Sound never moves against picture:
// a cut that moves takes its events with it, because every cue is tied to a source frame.
import fs from 'node:fs';
import path from 'node:path';
import { clipKey } from './brief.mjs';
import { globToRegExp } from './util.mjs';

// One clip's section of out/cues.md. Machine-read lines: "in: 0.00", "out: 3.00",
// "cut: none" or "cut: 1.20-1.80", "<event>: <seconds>" (or "<event>: start" = the clip's
// first frame in the edit), and "cue <row>: <seconds>" pins. Anything after the value is a
// comment. A line that says "not found" keeps its time and is reported.
export function readCueSheet(name, text) {
  const values = {};
  const missing = [];
  let cut = null;
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/[*`]/g, '').replace(/^\s*[-|]\s*/, '').trim();
    // "bird_1: not found, closest moment 0.50" reads as "bird_1: 0.50 (not found)".
    const nf = line.match(/^([A-Za-z][\w '’-]*?)\s*:\s*not found\D*?(-?\d+(?:\.\d+)?)/i);
    if (nf) line = `${nf[1]}: ${nf[2]} (not found)`;
    const m = line.match(/^([A-Za-z][\w '’-]*?)\s*[:|]\s*(none|start|-?\d+(?:\.\d+)?)(?:\s*(?:-|–)\s*(\d+(?:\.\d+)?))?\s*s?\b/i);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    if (key === 'cut') cut = m[2].toLowerCase() === 'none' ? null : [Number(m[2]), Number(m[3])];
    else if (m[2].toLowerCase() === 'start') values[key] = 'start';
    else if (m[2].toLowerCase() !== 'none') values[key] = Number(m[2]);
    if (/not found/i.test(line) && key !== 'cut') missing.push(key);
  }
  return { in: values.in ?? null, out: values.out ?? null, cut, events: Object.fromEntries(Object.entries(values).filter(([k]) => k !== 'in' && k !== 'out')), missing, name };
}

// out/cues.md: one "## <clip>" section per clip ("## S1_HAMMER" or "## S1").
export function readCombinedCueSheet(file) {
  const text = fs.readFileSync(file, 'utf8');
  const sheets = {};
  const parts = text.split(/^##\s+(?=[A-Za-z]+\d+\b|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*\b)/m).slice(1);
  for (const part of parts) {
    const head = part.split(/\r?\n/, 1)[0].trim();
    const key = clipKey(head.split(/\s/)[0]);
    sheets[key] = readCueSheet(head, part);
  }
  return sheets;
}

// Expands an event list against a clip's events: exact names, wildcards ("step_*", sorted by
// time) and "start". Returns [{ event, time }] where time is seconds or 'start'.
export function expandEvents(tokens, events = {}) {
  const out = [];
  for (const tok of tokens) {
    const t = tok.toLowerCase();
    if (t === 'start') {
      out.push({ event: 'start', time: events.start ?? 'start' });
      continue;
    }
    if (/[*?]/.test(t)) {
      const re = globToRegExp(t);
      const hits = Object.entries(events).filter(([k]) => re.test(k) && !k.startsWith('cue ')).sort((a, b) => (a[1] === 'start' ? -1 : a[1]) - (b[1] === 'start' ? -1 : b[1]));
      if (!hits.length) out.push({ event: tok, time: null, wildcardEmpty: true });
      for (const [k, v] of hits) out.push({ event: k, time: v });
      continue;
    }
    out.push({ event: tok, time: events[t] ?? null });
  }
  return out;
}

export function buildEntries(cfg, clips, cueFile, log) {
  const fps = cfg.fps;
  const sheets = cueFile && fs.existsSync(cueFile) ? readCombinedCueSheet(cueFile) : {};
  const entries = [];
  const events = {};
  const missing = {};
  for (const row of cfg.edl) {
    if (row.kind === 'card') {
      const frames = Math.round(cfg.endCard.seconds * fps);
      entries.push({ order: row.order, orders: [row.order], source: row.source, key: row.key, kind: 'card', clip: { frames, card: true }, content: row.content, inF0: 0, outF0: frames, inF: 0, outF: frames, notes: [] });
      continue;
    }
    const clip = clips[row.key];
    if (!clip) throw new Error(`EDL row ${row.order}: no clip file for ${row.source} in clips/`);
    const sheet = sheets[row.key];
    if (sheet) ((events[row.key] = sheet.events), (missing[row.key] = sheet.missing));
    let a = row.in;
    let b = row.out;
    let cut = null;
    if (a == null || b == null) {
      if (!sheet || sheet.in == null || sheet.out == null) throw new Error(`EDL row ${row.order} (${row.source}) has no in/out; write "## ${row.source}" with in:, out: and its events in ${cueFile ? path.basename(cueFile) : 'out/cues.md'} (run "briefcut sheets" first)`);
      a = sheet.in;
      b = sheet.out;
      cut = sheet.cut;
    }
    const spans = cut ? [[a, cut[0]], [cut[1], b]] : [[a, b]];
    for (const [x, y] of spans) {
      const inF = Math.max(0, Math.round(x * fps));
      const outF = Math.min(clip.frames, Math.round(y * fps));
      if (outF <= inF) throw new Error(`EDL row ${row.order}: empty range ${x}-${y}`);
      entries.push({ order: row.order, orders: [row.order], source: row.source, key: row.key, kind: 'clip', clip, content: row.content, inF0: inF, outF0: outF, inF, outF, notes: [] });
    }
  }
  return { entries, events, missing };
}

// Cue instances: one per audio-map row and event. id "4" for a single event, "4.2" for the
// second event of row 4. time = source seconds of the event plus offset ('start' events wait
// for the edit). "cue <row>: <s>" (or "cue 4.2: <s>") in the clip's sheet pins a verified frame.
export function expandCues(cfg, events, log) {
  const out = [];
  for (const c of cfg.cues) {
    const ev = events[c.key] || {};
    const pin = (id) => (typeof ev[`cue ${id}`] === 'number' ? ev[`cue ${id}`] : null);
    if (c.time != null) {
      out.push({ ...c, id: String(c.row), event: null, eventTime: c.time, time: pin(c.row) ?? c.time + c.offset, pinned: pin(c.row) != null });
      continue;
    }
    const list = expandEvents(c.events, ev);
    list.forEach((e, k) => {
      const id = list.length > 1 ? `${c.row}.${k + 1}` : String(c.row);
      const inst = { ...c, id, event: e.event, eventTime: e.time, pinned: false };
      const p = pin(id);
      if (p != null) ((inst.time = p), (inst.pinned = true));
      else if (e.time === 'start') inst.time = 'start';
      else if (e.time == null) {
        inst.time = null;
        inst.status = 'dropped';
        inst.dropReason = e.wildcardEmpty ? `no event matches "${e.event}" in ${c.key}` : `event "${e.event}" not in the ${c.key} cue sheet`;
        log.warn(`cue ${id}: ${inst.dropReason}`);
      } else inst.time = Math.round((e.time + c.offset) * 1e6) / 1e6;
      out.push(inst);
    });
  }
  return out;
}

// Shot rules: two pieces of one clip with a gap no longer than minDeadCut (or with a cue in
// the gap) are joined into one shot; a shot under minShot is kept as listed and flagged.
export function enforceShotRules(entries, cfg, cues, log) {
  const fps = cfg.fps;
  const { minShot, minDeadCut } = cfg.shotRules;
  const out = [];
  for (const e of entries) {
    const prev = out[out.length - 1];
    if (prev && prev.key === e.key && e.kind === 'clip' && e.inF0 >= prev.outF0) {
      const gap = (e.inF0 - prev.outF0) / fps;
      const covering = cues.filter((c) => c.key === e.key && typeof c.time === 'number' && c.time * fps >= prev.outF0 && c.time * fps < e.inF0);
      if (gap <= minDeadCut || covering.length) {
        const why = covering.length ? `cue ${covering.map((c) => c.id).join(', ')} falls inside it` : `${gap.toFixed(2)} s is not longer than the ${minDeadCut} s dead-cut minimum`;
        log.assume('shot rules', `${e.source}: pieces ${(prev.inF0 / fps).toFixed(2)}-${(prev.outF0 / fps).toFixed(2)} and ${(e.inF0 / fps).toFixed(2)}-${(e.outF0 / fps).toFixed(2)} joined; the gap is not cut because ${why}`);
        prev.notes.push(`joined; ${(prev.outF0 / fps).toFixed(2)}-${(e.inF0 / fps).toFixed(2)} kept (${why})`);
        prev.outF0 = prev.outF = e.outF0;
        prev.orders.push(e.order);
        continue;
      }
    }
    out.push(e);
  }
  for (const e of out) {
    const len = (e.outF0 - e.inF0) / fps;
    if (e.kind === 'clip' && len < minShot - 1e-9) {
      e.short = true;
      log.assume('shot rules', `${e.source} is ${len.toFixed(2)} s, under the ${minShot} s minimum shot; kept as listed and flagged in QA`);
    }
  }
  return out;
}

// Seconds of `frame` from the nearest beat of a grid { period, origin }.
export function offBeatMs(frame, fps, grid) {
  const t = frame / fps - (grid.origin || 0);
  const k = Math.round(t / grid.period);
  return Math.abs(t - k * grid.period) * 1000;
}

// Moves each cut by at most ±nudge frames toward the beat grid (dynamic programming over the
// timeline position and the next in-point nudge). Constraints: a shot never drops below the
// minimum shot (or its listed length, if already shorter); a cue frame never leaves its shot;
// cards keep their length; the film's first frame stays within firstEvent.seconds of its event.
// Without a grid the edit is laid out as listed.
export function snapCutsToBeats(entries, cfg, grid, cues, log) {
  const fps = cfg.fps;
  const N = grid ? cfg.music.nudgeFrames : 0;
  const cueFrames = entries.map((e) =>
    cues
      .filter((c) => c.key === e.key && typeof c.time === 'number' && c.status !== 'dropped')
      .map((c) => Math.round((c.eventTime != null && typeof c.eventTime === 'number' ? c.eventTime : c.time) * fps))
      .filter((f) => f >= e.inF0 && f < e.outF0),
  );
  const firstCap = cfg.firstEvent ? firstEventFrame(cfg, cues, entries[0]) : null;
  const cost0 = (frame) => (grid ? offBeatMs(frame, fps, grid) : 0);

  let states = new Map();
  for (let b = -N; b <= N; b++) states.set(`0|${b}`, { start: 0, b, cost: Math.abs(b), path: [] });
  for (let k = 0; k < entries.length; k++) {
    const e = entries[k];
    const last = k === entries.length - 1;
    const card = e.kind === 'card';
    const next = new Map();
    for (const s of states.values()) {
      const inF = card ? 0 : e.inF0 + s.b;
      if (card && s.b !== 0) continue;
      if (inF < 0 || (cueFrames[k].length && inF > Math.min(...cueFrames[k]))) continue;
      if (k === 0 && firstCap != null && firstCap - inF > Math.round(cfg.firstEvent.seconds * fps)) continue;
      const minLen = card ? e.outF0 : Math.min(Math.round(cfg.shotRules.minShot * fps), e.outF0 - e.inF0);
      const range = card || last ? 0 : N;
      for (let a = -range; a <= range; a++) {
        const outF = e.outF0 + a;
        if (outF > e.clip.frames || outF - inF < minLen) continue;
        if (cueFrames[k].length && outF <= Math.max(...cueFrames[k])) continue;
        const cut = s.start + outF - inF;
        const cost = s.cost + (last ? 0 : cost0(cut) * 10) + Math.abs(a);
        const p = [...s.path, { inF, outF }];
        const nextCard = entries[k + 1]?.kind === 'card';
        for (let b = last || nextCard ? 0 : -N; b <= (last || nextCard ? 0 : N); b++) {
          const key = `${cut}|${b}`;
          const c = cost + Math.abs(b);
          if (!next.has(key) || next.get(key).cost > c) next.set(key, { start: cut, b, cost: c, path: p });
        }
      }
    }
    states = next;
    if (!states.size) throw new Error(`beat snap: no valid nudge for EDL entry ${k + 1} (${e.source})`);
  }
  const best = [...states.values()].sort((x, y) => x.cost - y.cost)[0];
  let t = 0;
  best.path.forEach((p, k) => {
    const e = entries[k];
    e.inF = p.inF;
    e.outF = p.outF;
    e.tlStartF = t;
    t += e.outF - e.inF;
    e.tlEndF = t;
    e.cutOffBeatMs = grid && k < entries.length - 1 ? offBeatMs(t, fps, grid) : null;
    if (e.inF !== e.inF0 || e.outF !== e.outF0) log.info(`EDL ${k + 1} ${e.source}: in ${e.inF0}->${e.inF}, out ${e.outF0}->${e.outF} (frames)`);
  });
  return t;
}

function firstEventFrame(cfg, cues, first) {
  const c = cues.find((x) => x.key === first.key && x.event === cfg.firstEvent.event && typeof x.eventTime === 'number');
  return c ? Math.round(c.eventTime * cfg.fps) : null;
}

// Maps every cue to the timeline. picture = timeline time of its event frame; target = picture
// plus offset (where the sound's onset or transient must land). A cue whose frame is in a cut-out
// region is dropped and logged.
export function placeCues(entries, cues, cfg, log) {
  const fps = cfg.fps;
  for (const c of cues) {
    if (c.status === 'dropped') continue;
    let idx;
    let f;
    if (c.time === 'start') {
      idx = entries.findIndex((e) => e.key === c.key && e.kind === 'clip');
      f = idx >= 0 ? entries[idx].inF : null;
    } else {
      const evT = typeof c.eventTime === 'number' && !c.pinned ? c.eventTime : c.time - (c.pinned ? 0 : c.offset);
      f = Math.round(evT * fps);
      idx = entries.findIndex((e) => e.key === c.key && f >= e.inF && f < e.outF);
    }
    if (idx < 0) {
      c.status = 'dropped';
      c.dropReason = `${c.key} frame ${f} is in a cut-out region`;
      log.assume('cut-out', `cue ${c.id} (${c.voice}${c.event ? ` at ${c.event}` : ''}): its frame ${f} is not in the edit; dropped`);
      continue;
    }
    const e = entries[idx];
    c.entry = idx;
    c.sourceFrame = f;
    c.pictureFrame = e.tlStartF + f - e.inF;
    c.pictureTime = c.pictureFrame / fps;
    c.target = c.pictureTime + (c.pinned ? 0 : c.offset);
    c.timeline = c.target;
    c.status = 'placed';
  }
}

export function syncRule(c, cfg) {
  if (c.kind === 'voice' && c.offset) return `line ${c.offset > 0 ? '+' : ''}${c.offset.toFixed(2)} s after ${c.event || 'its event'}`;
  // A numbered name ("tap_1", "step_1 .. step_n") covers every event with the same stem.
  const stem = (n) => n.split('..')[0].replace(/\d+$/, '');
  const ev = (c.event || '').toLowerCase();
  const spec = cfg.eventSpecs.find((s) => s.key === c.key && s.names.some((n) => n.toLowerCase() === ev)) || cfg.eventSpecs.find((s) => s.key === c.key && s.names.some((n) => /\d+$|\.\./.test(n) && new RegExp(`^${stem(n)}\\d+$`, 'i').test(ev)));
  if (spec) return spec.what;
  if (c.event === 'start') return 'first frame of the shot in the edit';
  return c.kind === 'voice' ? 'speaker mouth opens' : 'event frame';
}
