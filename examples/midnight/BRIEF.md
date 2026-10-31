# MIDNIGHT: briefcut showcase film. Production brief for the agent

Read this whole file before doing anything. Ask nothing; if something is missing, write it to `OPEN_QUESTIONS.md` with your reason and continue with the best assumption. Look only at small contact sheets and strips, never full-resolution frames, never whole videos.

## Goal
A 9:16 film, 15-20 s, from four silent Flow clips of a clockmaker's workshop at night. It opens on a hook (a hammer hits brass in the first second) and ends on the midnight strike. Every sound on screen (hammer taps, a gear seating, the escapement, the cuckoo door and call, the midnight strike) lands on the frame where it happens. One narrator line after the strike. The music stops dead on the strike. A short black end card closes it. The point of the film is sync: one frame off shows.

## Folder layout
```
clockmaker/
  MIDNIGHT_BRIEF.md     this file
  FLOW_BRIEF.md         how the clips were made (not read by the pipeline)
  .env                  ELEVENLABS_API_KEY (may be .env.txt). Never print, log or commit it.
  clips/                S1_HAMMER.mp4, S2_GEARS.mp4, S3_CUCKOO.mp4, S4_MIDNIGHT.mp4 (9:16, 24 fps, 8 s)
  clips/_rejected/      rejected Flow takes (count them for the report, do not use)
  out/                  created by the pipeline
```
Discard all audio inside the clips. If a clip is not 1080x1920 / 24 fps, conform it and log it.

## Shot rules
Min shot: 2.0 s
Min dead cut: 0.75 s
Hard cuts only. No zooms, speed changes, freezes or reversed footage. The first frame of the film is at most 0.5 s before tap_1.

## EDL
| Order | Source | In | Out | Content |
|---|---|---|---|---|
| 1 | S1_HAMMER | | | three hammer taps (hook) |
| 2 | S2_GEARS | | | last gear drops in, escapement steps |
| 3 | S3_CUCKOO | | | bird pops out, calls twice, flies off |
| 4 | S4_MIDNIGHT | | | hands meet at XII, pendulums in unison, pull-back |
| 5 | END_CARD | 0.00 | 1.75 | black card, see End card |

In/out and events come from `out/cues.md`. Aim for roughly: S1 3.0 s, S2 3.5 s, S3 4.0 s, S4 5.0 s.

## Event detection
| Scene | Event name | What to look for |
|---|---|---|
| S1_HAMMER | tap_1, tap_2, tap_3 | first frame the hammer head touches the gear |
| S2_GEARS | gear_drop | first frame the gear rests on its post |
| S2_GEARS | step_1 .. step_n | each visible escapement step after gear_drop |
| S3_CUCKOO | bird_1 | first frame the carved bird is visible over the dial (no door is visible in this take, ~0.5 s) |
| S3_CUCKOO | bird_2 | frame the bird is furthest out / opens its wings (call 2) |
| S3_CUCKOO | fly_off | first frame the bird leaves the clock (~4.3 s) |
| S4_MIDNIGHT | midnight | first frame of S4 in the edit: the strike lands on the hard cut to the dial (the hands do not meet at XII in this take, see clips/NOTES.md) |
| S4_MIDNIGHT | pullback | first frame the camera starts pulling back (~1.4 s) |

If an event never happens on screen, write `not found`, place the cue on the closest visible moment that reads the same (pendulums swinging in unison, the lamp flicker), log it, and flag it at the top of the report.

## ElevenLabs
Narrator: `eleven_multilingual_v2`, stability 0.55, similarity 0.80, style 0.15, speaker boost on, speed 0.9.
Narrator voice by name, first that exists in the account: `George`, `Daniel`, `Brian`. Log which one was used. Forced alignment on.

## SFX
Generate each once with the SFX endpoint, cache it, reuse it. `Trim: transient` puts the main transient 3 ms into the file. Variants rotate so neighbouring hits differ.

| Name | Prompt | Seconds | Variants | Trim |
|---|---|---|---|---|
| hammer_tap | `tiny brass jeweller's hammer striking a small brass gear, hard bright metallic tink, close, dry` | 0.6 | 3 | transient |
| gear_seat | `small brass gear dropping onto a steel post and meshing, precise metallic click, close` | 0.8 | 1 | transient |
| escapement | `clock escapement tick, fine mechanical tick, very close macro sound, dry` | 0.4 | 3 | transient |
| cuckoo_door | `small wooden cuckoo clock door snapping open, wooden clack, close` | 0.6 | 1 | transient |
| cuckoo_call | `one wooden cuckoo clock bird call, two bellows notes, cuckoo, warm, slight room` | 1.2 | 1 | onset |
| wing_flutter | `small bird wings flapping away quickly, light feathery flutter, close` | 1.0 | 1 | onset |
| midnight_strike | `many antique clocks striking midnight at the same instant, deep bell gong with brass chimes, long natural decay` | 6.0 | 2 | transient |

## Audio map (times are detected event times from out/cues.md)
| Scene | Track | Voice | Text (send exactly) | At event | Offset |
|---|---|---|---|---|---|
| S1_HAMMER | A3 | sfx:hammer_tap | | tap_1, tap_2, tap_3 | 0.00 |
| S2_GEARS | A3 | sfx:gear_seat | | gear_drop | 0.00 |
| S2_GEARS | A3 | sfx:escapement | | step_* (every one) | 0.00 |
| S3_CUCKOO | A3 | sfx:cuckoo_door | | bird_1 | -0.10 |
| S3_CUCKOO | A3 | sfx:cuckoo_call | | bird_1, bird_2 | -0.05 |
| S3_CUCKOO | A3 | sfx:wing_flutter | | fly_off | 0.00 |
| S4_MIDNIGHT | A3 | sfx:midnight_strike | | midnight | 0.00 |
| S4_MIDNIGHT | A2 | Narrator | `Right on the hour.` | midnight | 1.80 |

Rules:
- SFX never move; they follow the picture. A hit that falls in a cut-out region is dropped and logged.
- The narrator never covers the strike's first 1.5 s. If the line would run past the end of S4, start it earlier (never before midnight + 1.5 s), else extend the S4 hold if frames are left, else let it finish over the end card.
- `cuckoo_call` offset -0.05 because the bellows note has a soft attack; the measured onset must land on the bird's furthest-out frame.

## Music and ambience
- Music (A4): `tense ticking music box and pizzicato strings, celesta melody, fast clockwork pulse, mysterious, rising toward a held suspended chord, 120 BPM, instrumental only, no vocals, 20 seconds`. Two takes, keep the one whose tempo is steadiest.
- Bed placement: beat 1 on timeline 0.00. Cuts between scenes may move at most ±3 frames toward the beat grid; SFX never move.
- Hard stop: the music ends on the `midnight` event (20 ms fade). After it, only the strike, its decay, the ambience and the narrator.
- Ambience (A5): `quiet night workshop room tone, dozens of distant clocks ticking softly out of sync, faint wind outside a small window`, 20 seconds, under the whole film at -30 dBFS RMS, 1.0 s fade out over the end card.

## Mix levels before master normalization
A2 narrator -6 dBFS peak. A3 SFX -9 dBFS peak (midnight_strike -4 dBFS peak, the loudest moment of the film). A4 music -21 dBFS RMS, ducked 4 dB under the narrator. A5 ambience -30 dBFS RMS.

## End card
1.75 s black, after S4. Two centered lines in a serif bold font (Windows `C:/Windows/Fonts/georgiab.ttf`, else DejaVu Serif Bold): `briefcut` (large), `brief in, film out` (small, 60% white). Text fades in over 0.25 s. No other text anywhere in the film.

## Export
`out/MIDNIGHT_master.mp4`: 1080x1920, 24 fps, H.264 CRF 18, yuv420p, AAC 192k 48 kHz. Two-pass loudnorm I=-14 TP=-1 LRA=11.
Also: `out/MIDNIGHT_preview_360p.mp4`, `out/MIDNIGHT_16x9.mp4` (the 9:16 film centred on a blurred 16:9 background, 1920x1080), `out/edl_sheet.jpg`, `out/sync_check.jpg`, `out/REPORT.md`, `out/SUMMARY.md`.

## QA (write to out/REPORT.md)
1. Duration 15-20 s.
2. -14 LUFS ±0.5, true peak ≤ -1 dBTP, no clipping.
3. Every event and cue placed or logged, with timeline times.
4. Every SFX onset within ±1 frame of its event frame, checked on sync_check.jpg from the master, not the premix.
5. Music silent after `midnight` (A4 below -60 dBFS from midnight + 20 ms).
6. midnight_strike is the loudest moment (momentary loudness, 400 ms).
7. First sound (tap_1) within the first 0.5 s.
8. First frame not black; last frame is the end card.
9. No audio from the source clips in the master.
10. Making-of numbers for the README: Flow takes used vs rejected, ElevenLabs characters used, SFX generations, total pipeline runtime.
