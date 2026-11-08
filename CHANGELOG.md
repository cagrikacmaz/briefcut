# Changelog

## 0.1.0 (2026-10-31)

First public shape of the pipeline I run in production, extracted into generic modules.

- Brief parser: EDL, event detection, voices, SFX table (`Name | Prompt | Seconds | Variants | Trim`),
  audio map with event lists, wildcards (`step_*`) and `clip start`, music and ambience, mix
  levels, end card, export, QA; presets (`default`, `kids-channel`); FIX passes (each `##` section
  replaces the brief's section of the same name) and `OVERRIDES.md`; a per-row `Gain` column; end-card
  events (`start`, `text_in`) and line sizes as a share of the frame height.
- Edit: frame-exact hard cuts, shot rules, beat snap that never breaks the minimum shot or moves a
  cue, end card, BT.709 conform, optional shot colour match and grade, 360p preview, 16:9 export on
  a blurred background.
- Audio: cached generations with request fingerprints, cost estimate and `--max-spend`, onset and
  transient trims, effects placed by their attack point, rotating SFX variants, voice rules (lead
  spacing, overlap control, caps that never cut words, protected windows, lines fitted to their
  shot), music take chosen by tempo steadiness, music hard stop, ambience, keyed ducking, two-pass
  loudnorm with an oversampled limiter, export measured with the EBU R128 meter; a held decay for
  ringing takes and effects ducked under the voices; a second loudness target per export (for
  example -10 LUFS for platforms that do not normalize), each mastered from the same premix.
- QA: duration, loudness and true peak on the export, cue placement, sync measured on the master,
  hard stop, loudest moment, hook, first and last frame, no source audio, hard cuts only, min shot,
  cuts on the grid, silence holes, ending energy before the end card, one loudness row per extra
  target; true peak counts the decoded sample peak; momentary loudness of the last 5 s in the
  report; `sync_check.jpg`, `edl_sheet.jpg`, preview and 16:9 sheets.
- Voices: a role can be chosen by audition (fundamental and spectral centroid of each candidate's
  take, lowest wins, comparison in `out/AUDITION.md`); per-role low shelf and compressor; effect
  ducks with their own timing, key and a deeper speech-band duck; a QA row for the line over an
  effect in the speech band.
- Own footage: any video file or still in `clips/` (a still is a held shot of its EDL length);
  `ingest --from <folder>` takes every video file and still from a card or download folder.
- Commands: `init`, `prompts`, `generate`, `ingest`, `sheets`, `strip`, `prepare`, `cut`, `run`,
  `estimate`, `regress`, `demo`.
- Providers: ElevenLabs (live), local and mock audio; handoff (live), Higgsfield, Gemini API
  (gemini-omni-1.1-flash), fal (Seedance 2.0) and mock video.
- Costs: `estimate`, the report and the summary state ElevenLabs costs in credits, voice
  auditions apart from the film; `--max-spend` stays in USD.
- Showcase film "Midnight" (`examples/midnight/`), version 3 after two review passes (versions 1 and 2 kept
  in `examples/midnight/out/v1/` and `out/v2/`), docs, playbooks, 62 offline tests, CI on Linux, Windows and
  macOS.
- Published on npm as `briefcut`: `npx briefcut demo`, or `npm install -g briefcut`.
