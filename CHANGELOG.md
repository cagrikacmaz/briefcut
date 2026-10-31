# Changelog

## 0.1.0 (2026-10-31)

First public shape of the pipeline I run in production, extracted into generic modules.

- Brief parser: EDL, event detection, voices, SFX table (`Name | Prompt | Seconds | Variants | Trim`),
  audio map with event lists, wildcards (`step_*`) and `clip start`, music and ambience, mix
  levels, end card, export, QA; presets (`default`, `kids-channel`); FIX passes and `OVERRIDES.md`.
- Edit: frame-exact hard cuts, shot rules, beat snap that never breaks the minimum shot or moves a
  cue, end card, BT.709 conform, optional shot colour match and grade, 360p preview, 16:9 export on
  a blurred background.
- Audio: cached generations with request fingerprints, cost estimate and `--max-spend`, onset and
  transient trims, effects placed by their attack point, rotating SFX variants, voice rules (lead
  spacing, overlap control, caps that never cut words, protected windows, lines fitted to their
  shot), music take chosen by tempo steadiness, music hard stop, ambience, keyed ducking, two-pass
  loudnorm with an oversampled limiter, export measured with the EBU R128 meter.
- QA: duration, loudness and true peak on the export, cue placement, sync measured on the master,
  hard stop, loudest moment, hook, first and last frame, no source audio, hard cuts only, min shot,
  cuts on the grid, silence holes; `sync_check.jpg`, `edl_sheet.jpg`, preview and 16:9 sheets.
- Commands: `init`, `prompts`, `generate`, `ingest`, `sheets`, `strip`, `prepare`, `cut`, `run`,
  `estimate`, `regress`, `demo`.
- Providers: ElevenLabs (live), local and mock audio; handoff (live), Higgsfield, Gemini API
  (gemini-omni-1.1-flash), fal (Seedance 2.0) and mock video.
- Showcase film "Midnight" (`examples/midnight/`), docs, playbooks, 45 offline tests, CI on Linux,
  Windows and macOS.
