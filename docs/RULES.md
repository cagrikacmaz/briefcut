# Rules

These are the edit, voice, sync and mix rules I wrote for my productions. Each exists because a
film broke without it; the failure behind each one is in [LESSONS.md](LESSONS.md). The numbers
below are the neutral defaults (`src/presets/default.json`); the channel preset
(`src/presets/kids-channel.json`) tightens the voice rules for very young viewers.

## Principles

- **The brief is the single source of truth.** Nothing it does not ask for is done: no upscales,
  frame-rate changes, speed ramps, grades or extra lines an agent finds "better".
- **Unattended.** The pipeline never asks. When something is undecided it takes the most
  reasonable option and writes the decision and its reason to `OPEN_QUESTIONS.md`.
- **QA can say FAIL, and the FAIL stays in the report.** A failing film is still exported, named
  as what it is, with the failing row on top.
- **Paid generations are cached and estimated before spending.** The same request is never sent
  twice; `estimate` and `--max-spend` run before any call.
- **Agents look at small sheets only.** 2 fps contact sheets and 8 or 24 fps strips; never
  full-resolution frames one by one, never whole videos.
- **Footage is never sped up, slowed, frozen, reversed, looped or zoomed** unless the brief says so.
  The render graph is checked for it.
- **Sound follows picture.** Every cue is tied to a source frame; moving a cut moves its sounds
  with it, never the other way round.

## Edit (`src/core/edl.mjs`)

- Hard cuts only. Frame-exact: one trim per shot, concatenated, encoded once.
- Minimum shot 2.0 s. A beat-snap nudge never takes a shot below it; a shot already shorter is
  kept as listed and fails the "Min shot" row.
- Dead time inside a clip is cut only when it is longer than the minimum dead cut and no cue falls
  inside it; otherwise the two pieces are joined. Covering dead time with sound is preferred.
- Cuts move at most ±3 frames toward the music's beat grid (beat one on the timeline time the brief
  gives). A cue frame never leaves its shot, a card keeps its length, and the hook rule (first frame
  within N s of the first event) is kept.
- Every clip is scaled to the film size, converted to BT.709 limited range and tagged; a clip at
  another size or rate is conformed by frame selection and logged.
- End card from the brief (font, lines, opacity, fade); in the 16:9 export the background under
  the card is black.

## Sync (`src/core/strips.mjs`, `src/core/sync-check.mjs`)

- An event is estimated on the 2 fps sheet, refined on an 8 fps strip (±0.75 s), settled on a
  24 fps strip when doubtful, and pinned as seconds = frame / fps in `out/cues.md`.
- What a frame must show: speech on the first mouth-open frame; a hit on the first contact frame;
  a call or gesture on its peak; a question on the head tilt. The brief's "What to look for" column
  says it per event.
- Effects are placed by their attack point (the first 5 ms window within 10 dB of the loudest window
  of the trimmed take): a creak before a clack, or a swelling flutter, is heard on its frame.
- A negative offset on a soft sound is the brief's compensation for a slow attack; since the attack
  itself is placed, it is not added again (logged).
- `sync_check.jpg` is cut from the master: each cue's frame plus 1/8 s before and after, labelled.
  The agent looks at it and moves pins until every frame shows its moment.
- An event that never happens on screen is written `not found`, placed on the closest moment that
  reads the same, and flagged on top of the report.

## Voices (`src/core/voices.mjs`)

- Generated audio is trimmed to its gated onset (-32 dB, 10 ms windows) before placement: leading
  silence never shifts a cue.
- Lead voices keep their picture moment and wait only for their own previous line plus 0.15 s, at
  most 0.3 s; past that the earlier line is cut at a word boundary (forced alignment), after trying
  a retake that fits whole.
- Different speakers overlap at most 0.15 s; the later line waits within its budget, the earlier
  line's tail is trimmed, a non-lead line is cut in the gap before a colliding word, and a line that
  still overlaps sits lower as a whole. Never a gain step inside a line.
- Caps (channel preset) count from the onset and never truncate a word: retakes first, else the line
  runs long and is logged.
- Protected windows (`never covers the strike's first 1.5 s`) are never covered by a line.
- A line that would run past its shot starts earlier (not before its floor), then the shot is held
  longer if the clip has frames left, else it finishes over the next shot.
- Tag-only lines get a vocalization for models that refuse them; a pronunciation map respells words
  in the text sent to TTS only.

## Music, ambience, mix (`src/core/mix.mjs`, `src/core/master.mjs`)

- With several music takes, the one with the steadiest tempo wins (local BPM spread over 6 s
  windows); its grid is frozen in `audio/music_pick.json`.
- Music level is set by RMS where it plays (before a hard stop), not over the silent tail.
- Hard stop: the music ends on the brief's event with a 20 ms fade; QA checks it is silent after.
- The music ducks under voices, keyed from the summed voice bus: 120 ms attack, 200 ms hold,
  450 ms release, at most 6 dB. Effects do not key it.
- Ambience runs under the whole film at its RMS level, looped if short, faded over the end card.
- Mastering: gain into a 4x oversampled, latency-compensated limiter, iterated until the limited
  signal is at the target, then two-pass linear loudnorm. Loudness and true peak are measured on
  the exported AAC with the EBU R128 meter; the limiter ceiling steps down (-1.5 to -3 dBTP) until
  the export passes. loudnorm's own meter can read a short film 0.5-1 LU off, so its target is
  biased by the measured difference (logged).

## Files and versions

- A FIX file makes the next export `_v2`, `_v3`; an existing master of the same name is copied to
  `out/work/prev/` before it is replaced.
- `OVERRIDES.md` holds decisions taken outside the brief, in brief syntax, each flagged on top of the
  report.
- `briefcut regress` re-renders a film in a mirror folder and compares frame hashes, decoded audio,
  loudness and the report tables.
