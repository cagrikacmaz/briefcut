// Brief parser: a markdown brief in, a config object out. Values the brief does not state come
// from the preset (presets/default.json unless the brief or --preset names another one), and
// every fallback that matters is logged as a decision, never asked.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PRESET_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'presets');

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

export const num = (s) => (s != null && /^\s*[-+]?\d+(\.\d+)?\s*$/.test(String(s)) ? Number(s) : null);
const ticks = (s) => String(s).replace(/^`|`$/g, '').trim();

// Clip key used to match EDL rows, audio map rows, cue sheet sections and files:
// "S1_HAMMER" -> "S1", "L12" -> "L12", "END_CARD" -> "END_CARD".
export function clipKey(name) {
  const s = String(name).trim();
  const m = s.match(/^([A-Za-z]+\d+)(?![A-Za-z])/);
  return m ? m[1].toUpperCase() : s.toUpperCase();
}

export function loadPreset(name = 'default') {
  const file = fs.existsSync(name) ? name : path.join(PRESET_DIR, `${name.replace(/\.json$/, '')}.json`);
  if (!fs.existsSync(file)) throw new Error(`preset "${name}" not found (looked in ${PRESET_DIR})`);
  const preset = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (preset.extends) return deepMerge(loadPreset(preset.extends), preset);
  return preset;
}

export function deepMerge(a, b) {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b === undefined ? a : b;
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) out[k] = typeof v === 'object' && v !== null && !Array.isArray(v) ? deepMerge(out[k], v) : v;
  return out;
}

// Markdown pipe tables: [{ headers, rows: [{header: cell}] }].
export function parseTables(text) {
  const lines = text.split(/\r?\n/);
  const tables = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].trim().startsWith('|') || !/^\s*\|\s*:?-{3,}/.test(lines[i + 1])) continue;
    const cells = (l) => splitRow(l);
    const headers = cells(lines[i]).map((h) => h.toLowerCase());
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].trim().startsWith('|'); j++) {
      const c = cells(lines[j]);
      rows.push(Object.fromEntries(headers.map((h, k) => [h, c[k] ?? ''])));
    }
    tables.push({ headers, rows, line: i + 1 });
    i = j - 1;
  }
  return tables;
}

// Split a table row on pipes that are not inside backticks.
function splitRow(line) {
  const s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const out = [];
  let cur = '';
  let tick = false;
  for (const ch of s) {
    if (ch === '`') tick = !tick;
    if (ch === '|' && !tick) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// Body of a "## Title..." section (title matched as a prefix, case-insensitive).
export function section(text, title) {
  const re = new RegExp(`^##\\s+${title}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'mi');
  const m = text.match(re);
  return m ? m[1] : '';
}

// "## Title" sections of a file, in order: [{ title, body }].
function topSections(text) {
  const out = [];
  const re = /^##\s+(.+?)\s*$/gm;
  const heads = [...text.matchAll(re)];
  heads.forEach((h, i) => out.push({ title: h[1], body: text.slice(h.index + h[0].length, i + 1 < heads.length ? heads[i + 1].index : undefined).replace(/^\r?\n/, '') }));
  return out;
}

// FIX passes: every "## <Section>" in a FIX file replaces the brief's section whose heading starts
// with the same words (or is appended when the brief has none). Later passes win; text outside a
// section is a note for the reader and changes nothing.
export function applyFixes(text, fixes) {
  let out = text;
  const applied = [];
  for (const fix of fixes) {
    for (const s of topSections(fix.text)) {
      const want = s.title.toLowerCase();
      const head = topSections(out).find((b) => b.title.toLowerCase().startsWith(want) || want.startsWith(b.title.toLowerCase()));
      const block = `## ${head ? head.title : s.title}\n${s.body.trimEnd()}\n\n`;
      if (head) {
        const esc = head.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out = out.replace(new RegExp(`^##\\s+${esc}\\s*\\n[\\s\\S]*?(?=^##\\s|(?![\\s\\S]))`, 'm'), () => block);
      } else out = `${out.trimEnd()}\n\n${block}`;
      applied.push(`${fix.name}: ${s.title}`);
    }
  }
  return { text: out, applied };
}

// The brief as the pipeline reads it: the brief file with its <ID>_FIXnn.md passes applied in order.
export function readBrief(briefFile) {
  const dir = path.dirname(briefFile);
  const base = fs.readFileSync(briefFile, 'utf8');
  const id = (path.basename(briefFile).match(/^([A-Za-z0-9]+)_BRIEF/i) || base.match(/^#\s+([A-Za-z0-9]+)/m) || [])[1];
  const fixes = id
    ? fs.readdirSync(dir).filter((f) => new RegExp(`^${id}_FIX\\d+\\.md$`, 'i').test(f)).sort().map((f) => ({ name: f, text: fs.readFileSync(path.join(dir, f), 'utf8') }))
    : [];
  return { ...applyFixes(base, fixes), fixes: fixes.map((f) => f.name) };
}

// "### Name" subsections of a section body.
export function subsections(body) {
  const out = [];
  const parts = body.split(/^###\s+/m).slice(1);
  for (const p of parts) {
    const nl = p.indexOf('\n');
    out.push({ title: p.slice(0, nl < 0 ? undefined : nl).trim(), body: nl < 0 ? '' : p.slice(nl + 1).trim() });
  }
  return out;
}

// Event list cell: "tap_1, tap_2, tap_3", "step_* (every one)", "clip start".
export function parseEventList(cell) {
  return String(cell)
    .replace(/\([^)]*\)/g, ' ')
    .split(/[,;]|\band\b/)
    .map((s) => ticks(s.trim()))
    .filter(Boolean)
    .map((s) => (/^clip\s+start$/i.test(s) ? 'start' : s));
}

// "step_1 .. step_n" style names in the event detection table.
function eventNames(cell) {
  return String(cell)
    .split(/,/)
    .map((s) => ticks(s.trim()))
    .filter(Boolean)
    .map((s) => s.replace(/\s*\.\.\s*/g, '..'));
}

function voiceSettingsFrom(line, base) {
  const s = { ...base };
  const val = (re) => {
    const m = line.match(re);
    return m ? Number(m[1]) : null;
  };
  const st = val(/stability\s+(\d+(?:\.\d+)?)/i);
  if (st != null) s.stability = st;
  const si = val(/similarity(?:[_ ]boost)?\s+(\d+(?:\.\d+)?)/i);
  if (si != null) s.similarity_boost = si;
  const sy = val(/style\s+(\d+(?:\.\d+)?)/i);
  if (sy != null) s.style = sy;
  const sp = val(/speed\s+(\d+(?:\.\d+)?)/i);
  if (sp != null) s.speed = sp;
  const b = line.match(/speaker boost\s+(on|off)/i);
  if (b) s.use_speaker_boost = b[1].toLowerCase() === 'on';
  return s;
}

export function parseBrief(text, briefName, log, { preset: presetArg = null } = {}) {
  const presetName = presetArg || (text.match(/^[-*\s]*Preset:\s*`?([\w.-]+)`?/im) || [])[1] || 'default';
  const P = loadPreset(presetName);
  const cfg = structuredClone(P);
  cfg.preset = presetName;
  cfg.briefName = briefName;
  cfg.id = ((briefName.match(/^([A-Za-z0-9]+)_BRIEF/i) || [])[1] || (text.match(/^#\s+([A-Za-z0-9]+)/m) || [])[1] || 'FILM').toUpperCase();
  cfg.title = (text.match(/^#\s+(.+)$/m) || [])[1]?.trim() || cfg.id;
  const assume = (topic, msg) => log.assume(topic, msg);

  const goal = section(text, 'Goal');
  const exp = section(text, 'Export');
  const qa = section(text, 'QA');
  const shot = section(text, 'Shot rules');

  // Format.
  const res = (goal + '\n' + exp).match(/(\d{3,4})x(\d{3,4})/);
  if (res) [cfg.width, cfg.height] = [Number(res[1]), Number(res[2])];
  else if (/\b9:16\b/.test(goal)) [cfg.width, cfg.height] = [1080, 1920];
  else if (/\b16:9\b/.test(goal)) [cfg.width, cfg.height] = [1920, 1080];
  else assume('format', `no resolution in the brief; using the preset's ${cfg.width}x${cfg.height}`);
  const fps = (exp + '\n' + goal).match(/(\d+(?:\.\d+)?)\s*fps/i);
  if (fps) cfg.fps = Number(fps[1]);
  const dur = (qa.match(/Duration\s+(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*s/i) || goal.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*s\b/));
  if (dur) cfg.durationQa = [Number(dur[1]), Number(dur[2])];
  else assume('duration', `no duration window in the brief; QA uses the preset's ${cfg.durationQa.join('-')} s`);

  // Shot rules ("Min shot: 2.0 s", "Min dead cut: 0.75 s"), anywhere in the brief.
  const minShot = text.match(/min(?:imum)? shot(?: length)?:\s*(\d+(?:\.\d+)?)\s*s/i);
  if (minShot) cfg.shotRules.minShot = Number(minShot[1]);
  const minDead = text.match(/min(?:imum)? dead cut:\s*(\d+(?:\.\d+)?)\s*s/i);
  if (minDead) cfg.shotRules.minDeadCut = Number(minDead[1]);
  const firstEv = (shot || text).match(/first frame of the film is at most\s+(\d+(?:\.\d+)?)\s*s before\s+`?([\w*]+)`?/i);
  cfg.firstEvent = firstEv ? { seconds: Number(firstEv[1]), event: firstEv[2] } : null;
  if (/no zooms|no speed changes|hard cuts only/i.test(shot + text)) cfg.hardCutsOnly = true;

  // Video model: one per film. A scene that names its own model is refused.
  const vm = text.match(/^[-*\s]*Video model:\s*`?([^`\n]+?)`?\s*$/im);
  if (vm) cfg.video.model = vm[1].trim();
  const vp = text.match(/^[-*\s]*Video provider:\s*`?([\w-]+)`?/im);
  if (vp) cfg.video.provider = vp[1].toLowerCase();
  const ap = text.match(/^[-*\s]*Audio provider:\s*`?([\w-]+)`?/im);
  if (ap) cfg.tts.provider = ap[1].toLowerCase();
  const cl = text.match(/^[-*\s]*Clip length:\s*(\d+(?:\.\d+)?)\s*s/im) || text.match(/(\d+(?:\.\d+)?)\s*s clips?\b/i);
  cfg.clipSeconds = cl ? Number(cl[1]) : null;
  const grade = text.match(/^[-*\s]*(?:colou?r\s+)?grade:\s*(?:(none|off)\b|`([^`]+)`)/im);
  if (grade) cfg.video.grade = grade[2] ? grade[2].trim() : null;
  const match = text.match(/^[-*\s]*shot match(?: reference)?:\s*`?(\w+)`?/im);
  if (match) {
    if (/^(off|none)$/i.test(match[1])) cfg.video.match = false;
    else if (/reference/i.test(match[0])) ((cfg.video.match = true), (cfg.video.matchReference = clipKey(match[1])));
    else cfg.video.match = /^on$/i.test(match[1]);
  }

  const tables = parseTables(text);
  const has = (t, ...cols) => cols.every((c) => t.headers.some((h) => h.startsWith(c)));
  const col = (row, prefix) => row[Object.keys(row).find((k) => k.startsWith(prefix))] ?? '';

  // EDL.
  const edlT = tables.find((t) => has(t, 'order', 'source', 'in', 'out'));
  if (!edlT) throw new Error('brief has no EDL table (Order | Source | In | Out | Content)');
  cfg.edl = edlT.rows.map((r) => {
    const source = ticks(col(r, 'source'));
    const card = /^end[_ ]?card$/i.test(source);
    return { order: Number(col(r, 'order')), source, key: card ? 'END_CARD' : clipKey(source), in: num(col(r, 'in')), out: num(col(r, 'out')), content: col(r, 'content'), kind: card ? 'card' : 'clip' };
  });
  const targets = goal.match(/Aim for roughly:([^\n]+)/i) || text.match(/Aim for roughly:([^\n]+)/i);
  cfg.shotTargets = {};
  if (targets) for (const m of targets[1].matchAll(/([A-Za-z]+\d+)\s+(\d+(?:\.\d+)?)\s*s/g)) cfg.shotTargets[clipKey(m[1])] = Number(m[2]);

  // Scenes and their per-scene video model (validated: one model per film).
  cfg.scenes = [];
  const scenesBody = section(text, 'Scenes');
  for (const s of subsections(scenesBody)) {
    const own = s.body.match(/^[-*\s]*(?:Video )?model:\s*`?([^`\n]+?)`?\s*$/im);
    cfg.scenes.push({ name: s.title.replace(/\s*\(.*\)$/, ''), key: clipKey(s.title), prompt: s.body.replace(/^[-*\s]*(?:Video )?model:.*$/gim, '').trim(), model: own ? own[1].trim() : null });
  }
  const styleBody = section(text, 'Shared style') || section(text, 'Style');
  cfg.style = styleBody.trim();
  const ownModels = cfg.scenes.filter((s) => s.model && s.model !== cfg.video.model);
  if (ownModels.length) throw new Error(`one video model per film: scenes ${ownModels.map((s) => s.name).join(', ')} name their own model; set "Video model:" once at film level`);

  // Event detection table.
  const evT = tables.find((t) => has(t, 'event') && (has(t, 'scene') || has(t, 'clip')) && t.headers.some((h) => /look|what/.test(h)));
  cfg.eventSpecs = evT ? evT.rows.map((r) => ({ scene: ticks(col(r, 'scene') || col(r, 'clip')), key: clipKey(col(r, 'scene') || col(r, 'clip')), names: eventNames(col(r, 'event')), what: col(r, 'what') })) : [];

  // Voices / TTS. Generic lines: "Model `x`", "Voices by name: `A`, `B`". Role lines:
  // "Narrator: `model`, stability .., similarity .., style .., speaker boost on, speed 0.9."
  // and "Narrator voice by name, first that exists in the account: `A`, `B`, `C`."
  const el = section(text, 'ElevenLabs') || section(text, 'Voices');
  cfg.tts.roles = {};
  const gm = el.match(/^[-*\s]*Model\s+`([^`]+)`/im);
  if (gm) cfg.tts.model = gm[1];
  cfg.tts.settings = voiceSettingsFrom(el.split(/\n/).find((l) => /stability/i.test(l) && !/^\s*\w+:\s*`/.test(l)) || '', cfg.tts.settings);
  for (const m of el.matchAll(/^[-*\s]*([A-Z][\w ]*?):\s*`([^`]+)`([^\n]*)$/gm)) {
    if (/^voices by name$/i.test(m[1])) continue;
    cfg.tts.roles[m[1].trim().toLowerCase()] = { name: m[1].trim(), model: m[2], settings: voiceSettingsFrom(m[3], cfg.tts.settings), candidates: [] };
  }
  for (const m of el.matchAll(/^[-*\s]*([A-Z][\w ]*?) voice by name[^:]*:\s*([^\n]+)$/gim)) {
    const role = (cfg.tts.roles[m[1].trim().toLowerCase()] ??= { name: m[1].trim(), model: cfg.tts.model, settings: { ...cfg.tts.settings }, candidates: [] });
    role.candidates = [...m[2].matchAll(/`([^`]+)`/g)].map((x) => x[1]);
  }
  const byName = el.match(/Voices by name:\s*([^\n]+)/i);
  if (byName) for (const v of [...byName[1].matchAll(/`([^`]+)`/g)].map((x) => x[1])) cfg.tts.roles[v.toLowerCase()] ??= { name: v, model: cfg.tts.model, settings: { ...cfg.tts.settings }, candidates: [v] };
  if (/forced alignment\s+(on|yes)/i.test(el)) cfg.tts.align = true;
  if (/forced alignment\s+(off|no)/i.test(el)) cfg.tts.align = false;
  if (/never\s+"?robust/i.test(el)) cfg.tts.forbidRobust = true;
  const lead = text.match(/^[-*\s]*Lead voices?:\s*([^\n]+)/im);
  cfg.voiceRules.leadVoices = lead ? [...lead[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]) : Object.values(cfg.tts.roles).slice(0, 1).map((r) => r.name);

  // SFX table: Name | Prompt | Seconds | Variants | Trim.
  cfg.sfx = {};
  const sfxT = tables.find((t) => has(t, 'name', 'prompt') && (has(t, 'seconds') || has(t, 'variants')));
  if (sfxT) {
    for (const r of sfxT.rows) {
      const name = ticks(col(r, 'name'));
      cfg.sfx[name] = { name, prompt: ticks(col(r, 'prompt')), seconds: num(col(r, 'seconds')), variants: num(col(r, 'variants')) || 1, trim: (col(r, 'trim') || 'transient').toLowerCase().trim() };
    }
  }

  // Audio map.
  const mapT = tables.find((t) => (has(t, 'scene') || has(t, 'source') || has(t, 'clip')) && has(t, 'track', 'voice'));
  if (!mapT) throw new Error('brief has no audio map table (Scene | Track | Voice | Text | At event | Offset)');
  cfg.cues = mapT.rows.map((r, i) => {
    const scene = ticks(col(r, 'scene') || col(r, 'source') || col(r, 'clip'));
    const voice = ticks(col(r, 'voice'));
    const sfx = voice.match(/^sfx:\s*([\w-]+)$/i);
    const at = col(r, 'at event') || col(r, 'at') || col(r, 'source time');
    return {
      row: i + 1,
      scene,
      key: clipKey(scene),
      track: col(r, 'track').toUpperCase() || (sfx ? 'A3' : 'A2'),
      voice: sfx ? `sfx:${sfx[1]}` : voice,
      kind: sfx ? 'sfx' : 'voice',
      sfxName: sfx ? sfx[1] : null,
      text: ticks(col(r, 'text')),
      time: num(at),
      events: num(at) == null ? parseEventList(at) : [],
      offset: num(col(r, 'offset').replace(/^\+/, '')) ?? 0,
      // Optional "Gain" column: dB on top of the bus level, for this row only.
      gain: num(col(r, 'gain').replace(/^\+/, '').replace(/\s*dB$/i, '')) ?? 0,
    };
  });
  for (const c of cfg.cues) {
    if (c.kind === 'sfx' && !cfg.sfx[c.sfxName]) throw new Error(`audio map row ${c.row}: sfx:${c.sfxName} is not in the SFX table`);
    if (c.kind === 'voice' && !cfg.tts.roles[c.voice.toLowerCase()]) {
      cfg.tts.roles[c.voice.toLowerCase()] = { name: c.voice, model: cfg.tts.model, settings: { ...cfg.tts.settings }, candidates: [c.voice] };
      assume('voices', `"${c.voice}" has no settings line in the brief; using the preset model ${cfg.tts.model} and settings, voice looked up by that name`);
    }
  }
  const leads = new Set(cfg.voiceRules.leadVoices.map((v) => v.toLowerCase()));
  for (const c of cfg.cues.filter((x) => x.kind === 'voice')) {
    const words = c.text.replace(/\[[^\]]*\]/g, ' ').match(/[\p{L}\p{N}'’]+/gu) || [];
    c.role = c.track !== 'A2' ? 'layer' : leads.has(c.voice.toLowerCase()) ? 'lead' : 'support';
    c.nonVerbal = words.length === 0;
    c.singleWord = words.length === 1;
  }
  // "The narrator never covers the strike's first 1.5 s": a window after an SFX no voice may start in.
  cfg.protect = [];
  for (const m of text.matchAll(/never covers the\s+([\w-]+?)(?:'s)?\s+first\s+(\d+(?:\.\d+)?)\s*s/gi)) {
    const word = m[1].toLowerCase();
    const sfx = Object.keys(cfg.sfx).find((n) => n.toLowerCase().includes(word));
    if (sfx) cfg.protect.push({ sfx, seconds: Number(m[2]) });
  }
  if (/start it earlier|extend the .* hold|finish over the end card/i.test(text)) cfg.voiceRules.fitLineToScene = true;

  // Music, bed and ambience.
  const music = section(text, 'Music');
  const mp = music.match(/Music(?:\s*\(A\d\))?:\s*`([^`]+)`/i);
  if (mp) {
    cfg.music.prompt = mp[1];
    cfg.music.enabled = true;
  }
  const takesM = music.match(/\b(\w+)\s+takes?\b/i);
  if (takesM) cfg.music.takes = num(takesM[1]) ?? NUMBER_WORDS[takesM[1].toLowerCase()] ?? cfg.music.takes;
  if (/steadiest/i.test(music)) cfg.music.pick = 'steadiest';
  const bpm = (cfg.music.prompt || '').match(/(\d+)\s*BPM/i);
  if (bpm) cfg.music.bpm = Number(bpm[1]);
  const secs = (cfg.music.prompt || '').match(/(\d+)\s*seconds/i);
  if (secs) cfg.music.seconds = Number(secs[1]);
  const nudge = (music || text).match(/at most\s*±\s*(\d+)\s*frames/i);
  if (nudge) cfg.music.nudgeFrames = Number(nudge[1]);
  const beat1 = music.match(/beat 1 on timeline\s+(\d+(?:\.\d+)?)/i);
  if (beat1) cfg.music.beatOneAt = Number(beat1[1]);
  const stop = music.match(/Hard stop:[^`\n]*`([\w*-]+)`[^\n]*?(?:\((\d+)\s*ms fade\))?/i);
  cfg.music.hardStop = stop ? { event: stop[1], fadeMs: Number(stop[2] || 20) } : null;
  const amb = music.match(/Ambience(?:\s*\(A\d\))?:\s*`([^`]+)`([^\n]*)/i);
  if (amb) {
    cfg.ambience.enabled = true;
    cfg.ambience.prompt = amb[1];
    const s = amb[2].match(/(\d+(?:\.\d+)?)\s*seconds/i);
    if (s) cfg.ambience.seconds = Number(s[1]);
    const r = amb[2].match(/(-?\d+(?:\.\d+)?)\s*dBFS RMS/i);
    if (r) cfg.levels.ambienceRms = Number(r[1]);
    const f = amb[2].match(/(\d+(?:\.\d+)?)\s*s fade out/i);
    if (f) cfg.ambience.fadeOut = Number(f[1]);
  }

  // Mix levels ("A2 narrator -6 dBFS peak. A3 SFX -9 dBFS peak (name -4 dBFS peak). A4 music -21 dBFS RMS, ducked 4 dB").
  const lv = section(text, 'Mix levels');
  const busLevel = (bus, kind) => {
    const m = lv.match(new RegExp(`${bus}\\b[^.]*?(-?[\\d.]+)\\s*dBFS\\s*${kind}`, 'i'));
    return m ? Number(m[1]) : null;
  };
  cfg.levels.voicePeak = busLevel('A2', 'peak') ?? cfg.levels.voicePeak;
  cfg.levels.sfxPeak = busLevel('A3', 'peak') ?? cfg.levels.sfxPeak;
  cfg.levels.musicRms = busLevel('A4', 'RMS') ?? cfg.levels.musicRms;
  cfg.levels.ambienceRms = busLevel('A5', 'RMS') ?? cfg.levels.ambienceRms;
  cfg.levels.sfxPeakByName = {};
  for (const name of Object.keys(cfg.sfx)) {
    const m = lv.match(new RegExp(`\\b${name}\\b\\s+(-?[\\d.]+)\\s*dBFS\\s*peak`, 'i'));
    if (m) cfg.levels.sfxPeakByName[name] = Number(m[1]);
  }
  // "midnight_strike decay held to 1.5 dB/s from 0.5 s after its attack (lift at most 30 dB)":
  // the take's tail is lifted so it falls no faster than that rate. "<name> ducked 6 dB under the
  // narrator": that effect is ducked under the voice bus like the music.
  cfg.levels.sfxHold = {};
  cfg.levels.sfxDuck = {};
  for (const name of Object.keys(cfg.sfx)) {
    const h = lv.match(new RegExp(`\\b${name}\\b[^.]*?decay held to\\s+(\\d+(?:\\.\\d+)?)\\s*dB/s(?:\\s+from\\s+(\\d+(?:\\.\\d+)?)\\s*s)?(?:[^.]*?lift at most\\s+(\\d+(?:\\.\\d+)?)\\s*dB)?`, 'i'));
    if (h) cfg.levels.sfxHold[name] = { rate: Number(h[1]), from: h[2] != null ? Number(h[2]) : 0.5, maxLift: h[3] != null ? Number(h[3]) : 30 };
    const d = lv.match(new RegExp(`\\b${name}\\b[^.\\n]*?ducked\\s+(\\d+(?:\\.\\d+)?)\\s*dB under`, 'i'));
    if (d) cfg.levels.sfxDuck[name] = Number(d[1]);
  }
  const duck = lv.match(/A4\b[^.]*?ducked\s+(\d+(?:\.\d+)?)\s*dB/i) || (Object.keys(cfg.levels.sfxDuck).length ? null : lv.match(/ducked\s+(\d+(?:\.\d+)?)\s*dB/i));
  if (duck) cfg.levels.duckDb = Number(duck[1]);
  if (!lv.trim()) assume('mix levels', 'no Mix levels section; using the preset levels');

  // End card.
  const ec = section(text, 'End card');
  if (ec.trim()) {
    const s = ec.match(/(\d+(?:\.\d+)?)\s*s\b/);
    cfg.endCard.seconds = s ? Number(s[1]) : cfg.endCard.seconds;
    cfg.endCard.fonts = [...ec.matchAll(/`([^`]+\.(?:ttf|otf|ttc))`/gi)].map((m) => m[1]);
    if (/DejaVu Serif Bold/i.test(ec)) cfg.endCard.fonts.push('DejaVuSerif-Bold.ttf');
    cfg.endCard.lines = [];
    for (const m of ec.matchAll(/`([^`]+)`\s*\(([^)]*)\)/g)) {
      if (/\.(ttf|otf|ttc)$/i.test(m[1])) continue;
      const opacity = m[2].match(/(\d+)%\s*white/i);
      const pct = m[2].match(/(\d+(?:\.\d+)?)%\s*of the (?:frame )?height/i);
      cfg.endCard.lines.push({ text: m[1], size: pct ? `${pct[1]}%` : /large/i.test(m[2]) ? 'large' : 'small', heightPct: pct ? Number(pct[1]) : null, opacity: opacity ? Number(opacity[1]) / 100 : 1 });
    }
    const fi = ec.match(/fades? in over\s+(\d+(?:\.\d+)?)\s*s/i);
    if (fi) cfg.endCard.fadeIn = Number(fi[1]);
    cfg.endCard.enabled = true;
  }
  const cardRow = cfg.edl.find((r) => r.kind === 'card');
  if (cardRow) {
    cfg.endCard.enabled = true;
    if (cardRow.out != null) cfg.endCard.seconds = cardRow.out - (cardRow.in || 0);
  }

  // Export.
  const name = (re) => (exp.match(re) || [])[1];
  cfg.export.master = name(/`out\/([^`]+_master\.mp4)`/i) || `${cfg.id}_master.mp4`;
  cfg.export.preview = name(/`out\/([^`]+_preview_\d+p\.mp4)`/i) || `${cfg.id}_preview_360p.mp4`;
  const wide = name(/`out\/([^`]+_16x9\.mp4)`/i);
  cfg.export.wide = wide || (cfg.export.wide === true && cfg.height > cfg.width ? `${cfg.id}_16x9.mp4` : null);
  const crf = exp.match(/CRF\s+(\d+)/i);
  if (crf) cfg.export.crf = Number(crf[1]);
  const aac = exp.match(/AAC\s+(\d+)k\s+(\d+)\s*kHz/i);
  if (aac) ((cfg.export.aacKbps = Number(aac[1])), (cfg.export.sampleRate = Number(aac[2]) * 1000));
  const LN = /I=(-?\d+(?:\.\d+)?)\s+TP=(-?\d+(?:\.\d+)?)(?:\s+LRA=(\d+(?:\.\d+)?))?/i;
  const lines = exp.split(/\r?\n/);
  const masterLine = lines.find((l) => l.includes(`out/${cfg.export.master}`) && LN.test(l));
  const ln = (masterLine || lines.find((l) => LN.test(l) && !/`out\/[^`]+\.mp4`/i.test(l.replace(`out/${cfg.export.master}`, ''))) || '').match(LN);
  if (ln) Object.assign(cfg.loudness, { I: Number(ln[1]), TP: Number(ln[2]), ...(ln[3] ? { LRA: Number(ln[3]) } : {}) });
  const tol = (qa + text).match(/(-?\d+)\s*LUFS\s*±\s*(\d+(?:\.\d+)?)/i);
  if (tol) cfg.loudness.tolerance = Number(tol[2]);
  // A second loudness target per export: a line naming other files and its own I= TP=, e.g.
  // "`out/X_social.mp4` and `out/X_16x9_social.mp4`: two-pass loudnorm I=-10 TP=-1 LRA=11".
  // Each file is mastered from the same mix; a 16x9 name gets the 16:9 export.
  cfg.export.extra = [];
  for (const l of lines) {
    const m = l.match(LN);
    if (!m || l === masterLine) continue;
    const files = [...l.matchAll(/`out\/([^`]+\.mp4)`/gi)].map((x) => x[1]).filter((f) => ![cfg.export.master, cfg.export.preview, cfg.export.wide].includes(f));
    if (!files.length) continue;
    cfg.export.extra.push({ files: files.map((f) => ({ name: f, wide: /16x9/i.test(f) })), loudness: { ...cfg.loudness, I: Number(m[1]), TP: Number(m[2]), ...(m[3] ? { LRA: Number(m[3]) } : {}) } });
  }
  const preset = exp.match(/x264 preset\s+`?(\w+)`?/i);
  if (preset) cfg.export.x264Preset = preset[1];
  const syncTol = qa.match(/within\s*±\s*(\d+)\s*frames?/i);
  if (syncTol) cfg.qa.syncFrames = Number(syncTol[1]);
  if (/source clips?/i.test(qa) && /no audio/i.test(qa)) cfg.qa.noSourceAudio = true;
  cfg.qa.loudestSfx = Object.keys(cfg.sfx).find((n) => new RegExp(`${n}\\b[^\\n]*loudest moment`, 'i').test(qa + lv)) || null;
  // "The last 3 s before the end card stay within 8 LU of the midnight_strike (momentary loudness)."
  const tail = qa.match(/last\s+(\d+(?:\.\d+)?)\s*s before the end card[^\n]*?within\s+(\d+(?:\.\d+)?)\s*LU of the\s+`?([\w-]+)`?/i);
  cfg.qa.tail = tail ? { seconds: Number(tail[1]), lu: Number(tail[2]), sfx: tail[3] } : null;
  cfg.discardClipAudio = !/keep (the )?clip audio/i.test(text);
  return cfg;
}

export function findBrief(filmDir, explicit) {
  if (explicit) return path.resolve(filmDir, explicit);
  const names = fs.readdirSync(filmDir);
  // A scene-prompt file (FLOW_BRIEF.md) is not the film brief: the brief has the EDL table.
  const isBrief = (f) => /\|\s*Order\s*\|\s*Source\s*\|/i.test(fs.readFileSync(path.join(filmDir, f), 'utf8'));
  const pick = names.find((f) => /^BRIEF\.md$/i.test(f)) || names.filter((f) => /_BRIEF\.md$/i.test(f)).find(isBrief);
  if (!pick) throw new Error(`no BRIEF.md or *_BRIEF.md in ${filmDir}`);
  return path.join(filmDir, pick);
}
