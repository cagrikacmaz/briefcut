// REPORT.md (QA table, edit, events, cues with frame error, mix, decisions), SUMMARY.md,
// cue_times.json and OPEN_QUESTIONS.md. A FAIL is written as FAIL and stays in the report.
import fs from 'node:fs';
import { t3, f2, writeJson, posix } from './util.mjs';
import { pass } from './qa.mjs';

// Audio cost as the provider bills it: credits when it counts credits, else estimated USD.
export function audioCost(making) {
  if (making.creditUnit == null) return `est. ${making.estUsd.toFixed(2)} USD`;
  const n = (x) => x.toLocaleString('en-US');
  return `${n(making.credits)} ${making.creditUnit}${making.auditionCredits ? ` for the film, ${n(making.auditionCredits)} for the voice audition` : ''}`;
}

const sgn = (x, d = 2) => (x == null || Number.isNaN(x) ? '-' : `${x >= 0 ? '+' : ''}${x.toFixed(d)}`);

export function qaRows(r) {
  const { cfg, qa, loud, making } = r;
  const L = cfg.loudness;
  const rows = [];
  const add = (check, ok, detail) => rows.push({ check, ok, detail });
  add(`Duration ${cfg.durationQa.join('-')} s`, qa.durationOk, `${t3(qa.duration)} s, ${qa.frames} frames (EDL total ${qa.totalF})`);
  add(`Loudness ${L.I} LUFS ±${L.tolerance}, true peak ≤ ${L.TP} dBTP, no clipping`, qa.loudOk && qa.clipOk, `I ${f2(loud.I)} LUFS, TP ${f2(loud.TP)} dBTP, LRA ${f2(loud.LRA)} LU (measured on the exported AAC); sample peak ${f2(qa.samplePeakDb)} dBFS, ${qa.clipped} samples at full scale`);
  const dropped = r.cues.filter((c) => c.status !== 'placed');
  add('Every event and cue placed or logged', qa.cuesOk, `${r.cues.filter((c) => c.status === 'placed').length} placed, ${dropped.length} dropped${dropped.length ? ` (${dropped.map((c) => `#${c.id}: ${c.dropReason}`).join('; ')})` : ''}; ${r.flags.length} event(s) not found`);
  add(`Every sound within ±${cfg.qa.syncFrames} frame of its frame, measured on the master`, qa.syncOk, `worst ${f2(qa.worstFrameError)} frames over ${qa.syncRows.length} sounds; each sound located in the master by cross-correlation against the premix (see Cues), frames checked on sync_check.jpg`);
  if (qa.hardStopAt != null) add(`Music silent after the hard stop (A4 below -60 dBFS from ${cfg.music.hardStop.event} + ${cfg.music.hardStop.fadeMs} ms)`, qa.musicStopOk, `stop at ${t3(qa.hardStopAt)} s; A4 peak afterwards ${qa.musicAfterDb === -Infinity || qa.musicAfterDb < -200 ? 'digital silence' : `${f2(qa.musicAfterDb)} dBFS`}`);
  if (qa.loudestSfx) add(`${qa.loudestSfx} is the loudest moment (momentary loudness, 400 ms)`, qa.loudestOk, `maximum M ${f2(qa.loudest.M)} LUFS at ${t3(qa.loudest.t)} s (window end); ${qa.loudestSfx} at ${r.hits.filter((h) => h.sfxName === qa.loudestSfx).map((h) => t3(h.timeline)).join(', ')} s`);
  for (const x of qa.extras || []) add(`\`${x.name}\`: ${x.L.I} LUFS ±${x.L.tolerance}, true peak ≤ ${x.L.TP} dBTP, no clipping`, x.ok, `I ${f2(x.loud.I)} LUFS, TP ${f2(x.loud.TP)} dBTP, LRA ${f2(x.loud.LRA)} LU (exported AAC); sample peak ${f2(x.samplePeakDb)} dBFS, ${x.clipped} samples at full scale; limiter ceiling ${x.master.ceilingDb} dBTP, loudnorm pass 2 ${x.master.pass2.normalization_type}`);
  if (cfg.qa.speechBand) {
    const sb = cfg.qa.speechBand;
    const m = qa.speechBand;
    add(`The ${sb.role} reads over ${sb.sfx}: speech band ${sb.lo}-${sb.hi} Hz at least ${sb.minDb} dB above it in the line's window`, qa.speechBandOk ?? false, m ? `${f2(m.ratioDb)} dB: ${sb.role} ${f2(m.voiceDb)} dBFS RMS, ${sb.sfx} ${f2(m.effectDb)} dBFS RMS, both band-limited to ${sb.lo}-${sb.hi} Hz (24 dB/octave edges), ${t3(m.from)}-${t3(m.to)} s (cue ${m.cue}), premix stems` : `no placed ${sb.role} line`);
  }
  if (cfg.qa.tail) add(`Last ${cfg.qa.tail.seconds} s before the end card within ${cfg.qa.tail.lu} LU of ${cfg.qa.tail.sfx} (momentary loudness)`, qa.tailOk ?? false, qa.tail ? `${cfg.qa.tail.sfx} M ${f2(qa.tail.ref?.M)} LUFS at ${t3(qa.tail.ref?.t)} s; lowest M from ${t3(qa.tail.from)} to ${t3(qa.tail.to)} s ${f2(qa.tail.low.M)} LUFS at ${t3(qa.tail.low.t)} s (window end), ${f2(qa.tail.gap)} LU below` : 'no end card or no strike to measure from');
  if (cfg.firstEvent) add(`First sound (${cfg.firstEvent.event}) within the first ${cfg.firstEvent.seconds} s`, qa.firstEventOk, `${cfg.firstEvent.event} at ${t3(qa.firstEventAt)} s`);
  add(qa.lastIsCard ? 'First frame not black; last frame is the end card' : 'First and last frame not black', qa.firstOk && qa.lastOk, `mean luma first ${f2(qa.firstLuma)}, last ${f2(qa.lastLuma)} (0-255)${qa.lastIsCard ? `, brightest end-card pixel ${qa.lastBright}` : ''}`);
  add('No audio from the source clips in the master', qa.sourceAudioOk, qa.sourceAudioDetail);
  add('Hard cuts only: no speed change, freeze, reverse, zoom or transition', qa.hardCutsOk, qa.hardCutsOk ? 'render graph holds trim, scale, colour, card text and concat only (out/work/render_graph.txt)' : `found: ${qa.retime.join(', ')}`);
  add(`Min shot ${cfg.shotRules.minShot} s`, qa.minShotOk, `shortest shot ${t3(qa.shortest)} s`);
  if (qa.beatOk != null) add(`Cuts on the music grid (±${cfg.music.nudgeFrames} frames allowed)`, qa.beatOk, `worst cut ${f2(qa.worstCutMs)} ms from a beat (one frame = ${f2(1000 / cfg.fps)} ms)`);
  add(`No silence below ${cfg.qa.silenceFloorDb} dBFS longer than ${cfg.qa.maxSilence} s`, qa.silenceOk, qa.silences.length ? qa.silences.map((s) => `${t3(s.start)}-${t3(s.end)}`).join(', ') : 'none');
  add('Making-of numbers', null, `takes used ${making.takesUsed}, rejected ${making.takesRejected}; ${making.provider} audio: ${making.characters} TTS characters, ${making.ttsGenerations} TTS, ${making.sfxGenerations} SFX, ${making.musicGenerations} music, ${making.ambienceGenerations} ambience generations in the cache (${making.generated.length} made this run, ${making.reused} reused); ${audioCost(making)}; runtime ${f2(qa.runtime)} s`);
  return rows;
}

export function writeReport(file, r) {
  const { cfg, entries, cues, qa, loud, master, grid } = r;
  const fps = cfg.fps;
  const L = [];
  L.push(`# ${cfg.id} report`, '');
  if (r.flags.length) {
    L.push('## Flagged for the owner', '');
    for (const f of r.flags) L.push(`- **${f}**`);
    L.push('');
  }
  L.push(`Generated ${new Date().toISOString()} by briefcut from \`${r.briefName}\` (preset \`${cfg.preset}\`, version ${r.version}).`, '');
  const rows = qaRows(r);
  L.push('## QA', '', '| # | Check | Result | Detail |', '|---|---|---|---|');
  rows.forEach((x, i) => L.push(`| ${i + 1} | ${x.check} | ${pass(x.ok)} | ${x.detail} |`));
  L.push('');

  L.push('## Edit decision list (as rendered)', '');
  L.push('| # | Source | Listed in-out (s) | Rendered in-out (s) | Nudge in/out (frames) | Timeline (s) | Length (s) | Cut vs beat (ms) | Content | Note |', '|---|---|---|---|---|---|---|---|---|---|');
  entries.forEach((e, k) => L.push(`| ${k + 1} | ${e.source} | ${t3(e.inF0 / fps)}-${t3(e.outF0 / fps)} | ${t3(e.inF / fps)}-${t3(e.outF / fps)} | ${e.inF - e.inF0}/${e.outF - e.outF0} | ${t3(e.tlStartF / fps)}-${t3(e.tlEndF / fps)} | ${t3((e.outF - e.inF) / fps)} | ${e.cutOffBeatMs == null ? '-' : f2(e.cutOffBeatMs)} | ${e.content} | ${e.notes.join('; ') || '-'} |`));
  L.push('');

  L.push('## Events', '', 'From `out/cues.md` (2 fps sheets, then 8 and 24 fps strips). Timeline = where the event frame lands in the cut.', '');
  L.push('| Clip | Event | Source t (s) | Source frame | Timeline (s) | Found |', '|---|---|---|---|---|---|');
  for (const [key, evs] of Object.entries(r.built.events)) {
    for (const [name, t] of Object.entries(evs)) {
      if (name.startsWith('cue ')) continue;
      const e = entries.find((x) => x.key === key);
      const f = t === 'start' ? e?.inF : Math.round(t * fps);
      const en = entries.find((x) => x.key === key && f >= x.inF && f < x.outF);
      L.push(`| ${key} | ${name} | ${t === 'start' ? `start (${t3(f / fps)})` : t3(t)} | ${f} | ${en ? t3((en.tlStartF + f - en.inF) / fps) : 'cut out'} | ${r.built.missing[key]?.includes(name) ? '**not found**, closest moment' : 'yes'} |`);
    }
  }
  L.push('');

  L.push('## Cues', '');
  L.push('Times in timeline seconds. Picture = the event frame. Target = picture + offset: where the sound must be heard to start. Effects are placed by their attack point (the first 5 ms window within 10 dB of the loudest window of the trimmed take), voices by their gated onset. Heard = where that point sits in the master: the take\'s first 80 ms are located in the master audio by cross-correlation (shift column) and the shift is added to the target. Error = heard - target, in frames. The frames themselves are verified by eye on sync_check.jpg, cut from the master.', '');
  L.push('| # | Scene | Sound | Event | Offset | Picture | Target | Heard | Error (frames) | Shift in master (ms) | Variant / file | Status | Notes |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const order = [...cues].sort((a, b) => (a.timeline ?? 1e9) - (b.timeline ?? 1e9));
  for (const c of order) {
    const placed = c.status === 'placed';
    const heard = c.kind === 'sfx' ? c.measuredAttack : placed ? c.timeline + (c.measuredShiftMs || 0) / 1000 : null;
    L.push(`| ${c.id} | ${c.scene} | ${c.kind === 'sfx' ? `sfx:${c.sfxName}` : `${c.voice} \`${c.text}\``} | ${c.event ?? '-'} | ${sgn(c.offset)} | ${placed ? t3(c.pictureTime) : '-'} | ${placed ? t3(c.target) : '-'} | ${placed ? t3(heard) : '-'} | ${placed ? sgn(c.frameError) : '-'} | ${placed ? f2(c.measuredShiftMs) : '-'} | ${c.file ?? '-'} | ${c.status}${c.dropReason ? `: ${c.dropReason}` : ''} | ${[c.sentText && c.sentText !== c.text ? `sent \`${c.sentText}\`` : null, c.voiceUsed ? `voice ${c.voiceUsed}` : null, ...(c.notes || [])].filter(Boolean).join('; ') || '-'} |`);
  }
  L.push('');

  L.push('## Mix and master', '');
  L.push(`- A2 voices peak-normalized to ${cfg.levels.voicePeak} dBFS; A3 effects to ${cfg.levels.sfxPeak} dBFS peak${Object.keys(cfg.levels.sfxPeakByName).length ? ` (${Object.entries(cfg.levels.sfxPeakByName).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}.`);
  if (r.music) L.push(`- A4 music: take ${r.music.pick.used} of ${r.music.pick.rows.length} (${r.music.pick.rule}: local tempo spread ${r.music.pick.rows.map((x) => `take ${x.take} ${f2(x.bpmStdDev)} BPM`).join(', ')}); ${f2(grid.bpm)} BPM detected, downbeat at ${t3(grid.downbeat)} s of the file placed on timeline ${t3(grid.origin)} s; ${cfg.levels.musicRms} dBFS RMS where it plays (gain ${f2(r.mixRes.musicGainDb)} dB), ducked up to ${f2(r.mixRes.duckDepthDb)} dB under the voices${r.stopAt != null ? `; hard stop at ${t3(r.stopAt)} s with a ${cfg.music.hardStop.fadeMs} ms fade` : ''}.`);
  if (r.mixRes.ambienceGainDb != null) L.push(`- A5 ambience at ${cfg.levels.ambienceRms} dBFS RMS under the whole film (gain ${f2(r.mixRes.ambienceGainDb)} dB), ${cfg.ambience.fadeOut} s fade out at the end.`);
  L.push(`- Pre-master ${f2(Number(master.pre.input_i))} LUFS / ${f2(Number(master.pre.input_tp))} dBTP; gain ${f2(master.gain)} dB; limiter ceiling ${master.ceilingDb} dBTP at 4x oversampling (latency compensated); loudnorm pass 2 output ${master.pass2.output_i} LUFS, ${master.pass2.output_tp} dBTP, mode ${master.pass2.normalization_type}.`);
  const holds = Object.entries(cfg.levels.sfxHold || {});
  if (holds.length) L.push(`- Decay held: ${holds.map(([k, h]) => `${k} falls no faster than ${h.rate} dB/s from ${h.from} s after its loudest 50 ms (lift at most ${h.maxLift} dB)`).join('; ')}.`);
  const ducks = Object.entries(cfg.levels.sfxDuck || {});
  if (ducks.length) L.push(`- Effects ducked under the voices (keyed like the music): ${ducks.map(([k, d]) => `${k} ${d.db} dB, ${d.attackMs ?? cfg.levels.attackMs} ms attack, ${d.releaseMs ?? cfg.levels.releaseMs} ms release${d.band ? `, ${d.band.extraDb} dB more in ${d.band.lo}-${d.band.hi} Hz (${d.band.attackMs ?? d.attackMs ?? cfg.levels.attackMs} ms attack, ${d.band.releaseMs ?? d.releaseMs ?? cfg.levels.releaseMs} ms release)` : ''}${d.holdMs != null ? `, ${d.holdMs} ms hold` : ''}${d.keyDb != null ? `, keyed at ${d.keyDb} dBFS` : ''}`).join('; ')}.`);
  const shelves = Object.entries(cfg.levels.voiceShelf || {});
  const comps = Object.entries(cfg.levels.voiceComp || {});
  if (comps.length) L.push(`- Voice dynamics: ${comps.map(([k, x]) => `${k} compressed ${x.ratio}:1 above ${x.thresholdDb} dBFS (${x.attackMs} ms attack, ${x.releaseMs} ms release)`).join('; ')}, then back to the voice's peak level.`);
  if (shelves.length) L.push(`- Voice colour: ${shelves.map(([k, x]) => `${k} low shelf ${x.gainDb > 0 ? '+' : ''}${x.gainDb} dB at ${x.freq} Hz`).join('; ')}, then back to the voice's peak level.`);
  L.push(`- Export: \`out/${cfg.export.master}\` ${cfg.width}x${cfg.height}, ${fps} fps, H.264 CRF ${cfg.export.crf} (${cfg.export.x264Preset}), yuv420p, BT.709, AAC ${cfg.export.aacKbps}k ${cfg.export.sampleRate / 1000} kHz; \`out/${cfg.export.preview}\`${cfg.export.wide ? `; \`out/${cfg.export.wide}\` (16:9, blurred background)` : ''}.`);
  for (const x of qa.extras || []) L.push(`- Extra loudness target: \`out/${x.name}\` at ${x.L.I} LUFS / ${x.L.TP} dBTP, mastered from the same premaster (gain ${f2(x.master.gain)} dB, limiter ceiling ${x.master.ceilingDb} dBTP); measured I ${f2(x.loud.I)} LUFS, TP ${f2(x.loud.TP)} dBTP.`);
  if (r.card) L.push(`- End card: ${cfg.endCard.seconds} s, font \`${r.card.font ? posix(r.card.font).split('/').pop() : 'ffmpeg default'}\`, ${cfg.endCard.lines.map((l) => `"${l.text}" (${l.size}${l.opacity < 1 ? `, ${Math.round(l.opacity * 100)}%` : ''})`).join(', ')}, fade in ${cfg.endCard.fadeIn} s.`);
  if (r.fixes?.length) L.push(`- FIX passes applied: ${r.fixes.map((f) => `\`${f}\``).join(', ')}.`);
  L.push('');

  if (qa.lastSeconds?.length) {
    L.push('## Momentary loudness, last 5 s', '', `Master, 400 ms windows, value at the window end.${r.cardFrom != null ? ` End card from ${t3(r.cardFrom)} s.` : ''}${qa.tail?.ref ? ` Reference: ${cfg.qa.tail.sfx} M ${f2(qa.tail.ref.M)} LUFS.` : ''}`, '');
    L.push(`| t (s) | M (LUFS) |${qa.tail?.ref ? ' Below reference (LU) |' : ''}`, `|---|---|${qa.tail?.ref ? '---|' : ''}`);
    const pts = qa.lastSeconds.filter((p) => Math.round(p.t * 10) % 2 === 0);
    for (const p of pts) L.push(`| ${p.t.toFixed(2)} | ${Number.isFinite(p.M) ? f2(p.M) : '-inf'} |${qa.tail?.ref ? ` ${Number.isFinite(p.M) ? f2(qa.tail.ref.M - p.M) : '-'} |` : ''}`);
    L.push('');
  }

  L.push('## Decisions and log', '');
  for (const a of r.log.assumptions) L.push(`- **${a.topic}**: ${a.msg}`);
  for (const w of r.log.warnings) L.push(`- warning: ${w}`);
  L.push('');
  fs.writeFileSync(file, L.join('\n'));
}

export function writeSummary(file, r) {
  const { cfg, qa, loud, making } = r;
  const rows = qaRows(r).filter((x) => x.ok != null);
  const failed = rows.filter((x) => x.ok === false);
  const hits = r.hits.filter((h) => h.status === 'placed');
  const lines = [
    `# ${cfg.id} summary`,
    '',
    `1. Output: \`out/${cfg.export.master}\` (${cfg.width}x${cfg.height}, ${cfg.fps} fps), \`out/${cfg.export.preview}\`${cfg.export.wide ? `, \`out/${cfg.export.wide}\`` : ''}${(qa.extras || []).map((x) => `, \`out/${x.name}\``).join('')}.`,
    `2. Duration ${t3(qa.duration)} s (${qa.frames} frames); loudness ${f2(loud.I)} LUFS, true peak ${f2(loud.TP)} dBTP${(qa.extras || []).map((x) => `; ${x.name} ${f2(x.loud.I)} LUFS, ${f2(x.loud.TP)} dBTP`).join('')}.`,
    `3. Edit: ${r.entries.map((e) => `${e.source} ${t3((e.outF - e.inF) / cfg.fps)} s`).join(', ')}.`,
    `4. Cues: ${r.cues.filter((c) => c.status === 'placed').length} placed, ${r.cues.filter((c) => c.status !== 'placed').length} dropped; ${hits.length} effects, worst sync error ${f2(qa.worstFrameError)} frames (tolerance ±${cfg.qa.syncFrames}).`,
    `5. Flagged for the owner: ${r.flags.length ? `${r.flags.length} item(s) on top of REPORT.md (${Object.entries(r.built.missing).filter(([, l]) => l.length).map(([k, l]) => `${k} ${l.length} event(s) not found`).concat(r.flags.filter((x) => /OVERRIDES/.test(x)).length ? ['overrides'] : []).join('; ')})` : 'none'}.`,
    `6. Music: ${r.music ? `take ${r.music.pick.used} of ${r.music.pick.rows.length}, ${f2(r.grid.bpm)} BPM${r.stopAt != null ? `, hard stop at ${t3(r.stopAt)} s` : ''}` : 'none'}.`,
    `7. Voices: ${[...new Set(r.cues.filter((c) => c.voiceUsed).map((c) => `${c.voice} = ${c.voiceUsed}`))].join(', ') || 'none'}.`,
    `8. Audio: ${making.characters} TTS characters, ${making.sfxGenerations} SFX, ${making.musicGenerations} music, ${making.ambienceGenerations} ambience generations (${making.generated.length} new this run), ${audioCost(making)}.`,
    `9. QA: ${failed.length ? `FAIL on ${failed.map((x) => x.check).join('; ')}` : `all ${rows.length} checks pass`}.`,
    `10. Decisions: ${r.log.assumptions.length} logged in OPEN_QUESTIONS.md (${[...new Set(r.log.assumptions.map((a) => a.topic))].join(', ') || 'none'}); runtime ${f2(qa.runtime)} s.`,
    '',
  ];
  fs.writeFileSync(file, lines.join('\n'));
}

export function writeCueTimes(file, r) {
  writeJson(file, Object.fromEntries(r.cues.map((c) => [c.id, { scene: c.scene, sound: c.kind === 'sfx' ? `sfx:${c.sfxName}` : c.voice, event: c.event, status: c.status, picture: c.pictureTime ?? null, target: c.target ?? null, frameError: c.frameError ?? null, file: c.file ?? null }])));
}

// Keeps hand-written notes in OPEN_QUESTIONS.md and refreshes the section briefcut writes.
export function writeOpenQuestions(file, log) {
  const start = '<!-- briefcut:start -->';
  const end = '<!-- briefcut:end -->';
  const body = [start, '## Decided by briefcut', '', ...(log.assumptions.length ? log.assumptions.map((a) => `- **${a.topic}**: ${a.msg}`) : ['- none']), end].join('\n');
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '# Open questions\n\nWhat the brief did not settle, and what was decided instead of asking. Edit the brief or answer here, then run again.\n\n';
  text = text.includes(start) ? text.replace(new RegExp(`${start}[\\s\\S]*?${end}`), body) : `${text.trimEnd()}\n\n${body}`;
  fs.writeFileSync(file, text.trimEnd() + '\n');
}
