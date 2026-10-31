# Brief format

A brief is one markdown file in the film folder: `BRIEF.md`, or `<ID>_BRIEF.md` (the file with an
EDL table; a scene-prompt file like `FLOW_BRIEF.md` is skipped). It is the single source of truth
for the film. Correction passes go in `<ID>_FIX01.md`, `<ID>_FIX02.md` ...; each makes the next
export a new version (`_v2`, `_v3`), and no master is overwritten. Decisions taken outside the
brief go in `OVERRIDES.md` and are flagged on top of the report.

Two complete examples: [`examples/hello-short/BRIEF.md`](../examples/hello-short/BRIEF.md)
(mock providers) and [`examples/midnight/BRIEF.md`](../examples/midnight/BRIEF.md) (the showcase).
`briefcut init <dir>` writes a template.

What the brief does not state comes from the preset (`src/presets/default.json`, or
`Preset: <name>` / `--preset <name>`), and every fallback that matters is logged in
`OPEN_QUESTIONS.md`. The parser is `src/core/brief.mjs`; its tests are `test/brief.test.mjs`.

## Film-level lines (anywhere, one per line)

| Line | Meaning |
|---|---|
| `Preset: kids-channel` | start from another preset |
| `Video provider: handoff` | `handoff`, `higgsfield`, `gemini-omni`, `fal`, `mock` |
| `Video model: seedance-2.0` | one model for every scene |
| `Audio provider: elevenlabs` | `elevenlabs`, `local`, `mock` |
| `Clip length: 8 s` | length requested from the video provider |
| `Grade: none` / ``Grade: `<ffmpeg filter>` `` | colour grade after the BT.709 conversion |
| `Shot match: on` / `Shot match reference: S2` | match every shot's levels and saturation to a reference |
| `Lead voices: `A`` | voices that keep their picture moment (default: the first voice) |
| `Min shot: 2.0 s`, `Min dead cut: 0.75 s` | shot rules |
| `Cap `[laughs] Hi!`: 1.2 s` | per-line voice cap |

## Sections

**`## Goal`**: aspect ratio or `1080x1920`, frame rate, and a duration window (`15-20 s`).
`Aim for roughly: S1 3.0 s, S2 3.5 s` records target shot lengths for the agent.

**`## Shot rules`**: `Min shot`, `Min dead cut`, `Hard cuts only`, and
`The first frame of the film is at most 0.5 s before tap_1.` (a hook rule the beat snap respects
and QA checks).

**`## Scenes`** (for `prompts` and `generate`): one `### S1_NAME` per scene with its prompt.
`## Shared style` is appended to every prompt. A `- Mock events: hit_1=6, hit_2=33` line tells the
mock video provider which frames flash.

**`## EDL`**:

```
| Order | Source | In | Out | Content |
|---|---|---|---|---|
| 1 | S1_HAMMER | | | three hammer taps (hook) |
| 5 | END_CARD | 0.00 | 1.75 | black card |
```

Empty In/Out come from the cue sheet. `END_CARD` is generated from `## End card`. Clip files are
matched by key: `S1_HAMMER` -> `clips/S1*.mp4`.

**`## Event detection`**: what the agent must find, per scene.

```
| Scene | Event name | What to look for |
|---|---|---|
| S1_HAMMER | tap_1, tap_2, tap_3 | first frame the hammer head touches the gear |
| S2_GEARS | step_1 .. step_n | each visible escapement step |
```

The "What to look for" text is printed under the frame on `sync_check.jpg`.

**`## ElevenLabs`** (or `## Voices`):

```
Narrator: `eleven_multilingual_v2`, stability 0.55, similarity 0.80, style 0.15, speaker boost on, speed 0.9.
Narrator voice by name, first that exists in the account: `George`, `Daniel`, `Brian`.
Forced alignment on.
```

Channel-style briefs can instead say ``Model `eleven_v3` `` and ``Voices by name: `A`, `B` ``.

**`## SFX`**: one generation per variant, cached.

```
| Name | Prompt | Seconds | Variants | Trim |
|---|---|---|---|---|
| hammer_tap | `tiny brass hammer on a brass gear, close, dry` | 0.6 | 3 | transient |
| cuckoo_call | `one wooden cuckoo call, two notes` | 1.2 | 1 | onset |
```

`Trim: transient` keeps the main hit 3 ms into the file; `onset` gates a softer sound's start;
`none` keeps the file as generated. Either way the effect is placed by its attack point (where it
is heard to start), and variants rotate so neighbouring hits differ.

**`## Audio map`**:

```
| Scene | Track | Voice | Text | At event | Offset |
|---|---|---|---|---|---|
| S1_HAMMER | A3 | sfx:hammer_tap | | tap_1, tap_2, tap_3 | 0.00 |
| S2_GEARS | A3 | sfx:escapement | | step_* (every one) | 0.00 |
| S4_MIDNIGHT | A2 | Narrator | `Right on the hour.` | midnight | 1.80 |
```

`Voice` is a voice role from `## ElevenLabs` or `sfx:<name>` from `## SFX`. `At event` takes one
event, a list, a wildcard (`step_*`, every match in time order), `clip start` (the shot's first
frame in the edit), or a number of seconds. Text in parentheses is ignored. `Offset` is added on
the timeline. A row whose event falls in a cut-out region is dropped and logged.

Rule prose the parser reads: `The narrator never covers the strike's first 1.5 s` (no voice starts
inside that window of the SFX whose name contains "strike"); `start it earlier ... extend the hold
... finish over the end card` (a line that would run past its shot starts earlier, then the shot is
held longer if the clip has frames, then it runs over).

**`## Music and ambience`**:

```
- Music (A4): `style, instruments, 120 BPM, instrumental only, 20 seconds`. Two takes, keep the one whose tempo is steadiest.
- Bed placement: beat 1 on timeline 0.00. Cuts may move at most ±3 frames toward the beat grid; SFX never move.
- Hard stop: the music ends on the `midnight` event (20 ms fade).
- Ambience (A5): `room tone`, 20 seconds, under the whole film at -30 dBFS RMS, 1.0 s fade out over the end card.
```

**`## Mix levels`**: `A2 narrator -6 dBFS peak. A3 SFX -9 dBFS peak (midnight_strike -4 dBFS peak).
A4 music -21 dBFS RMS, ducked 4 dB under the narrator. A5 ambience -30 dBFS RMS.`

**`## End card`**: length, font paths in backticks, lines as `` `text` (large) `` /
`` `text` (small, 60% white) ``, `fades in over 0.25 s`.

**`## Export`**: master name (`` `out/NAME_master.mp4` ``), size, fps, `CRF 18`,
`x264 preset slow`, `AAC 192k 48 kHz`, `loudnorm I=-14 TP=-1 LRA=11`, and optional
`` `out/NAME_preview_360p.mp4` `` and `` `out/NAME_16x9.mp4` ``.

**`## QA`**: the duration window, `-14 LUFS ±0.5`, `within ±1 frame`, and
`<sfx> is the loudest moment` become checks; see [QA.md](QA.md).

## The cue sheet (`out/cues.md`)

Written by the agent after looking at the sheets and strips (see
[AGENT_WORKFLOW.md](AGENT_WORKFLOW.md)). One section per clip:

```
## S1_HAMMER
in: 0.000
out: 3.000
cut: none
tap_1: 0.042   (sheet 0.0; 24 fps f1: head on the gear, f0 still descending)
step_1: not found, closest 2.250   (placed on the music beat)
midnight: start
cue 8: 12.300
```

Seconds are frame / fps. Anything after the value is a comment. `not found` keeps the time and is
flagged on top of the report. `start` is the clip's first frame in the edit. `cue <row>: <s>` (or
`cue 4.2:` for the second event of row 4) pins a verified frame and wins over event + offset.
`cut: 1.20-1.80` removes a stretch inside the clip (only if it is longer than the minimum dead cut
and no cue falls inside it).
