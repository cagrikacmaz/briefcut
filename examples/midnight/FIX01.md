# MIDNIGHT FIX01: ending energy, tighter cut, social loudness

Revision pass after review of v1. Each `##` section below replaces the section of the same name
in MIDNIGHT_BRIEF.md; everything else stays as briefed. Renders as version 2 (`_v2`).

What changes and why:
- In v1 the last 2.5 s before the end card fall to -28 LUFS momentary at 14.0 s and -40 LUFS by
  15.5 s. The strike now keeps ringing (its own decay, held), the narrator is 3 dB louder and
  earlier, the ambience runs through the card, and one soft tick lands as the card text settles.
- S2 holds a near-static frame for about 2 s after the gear seats; S4 holds after the pull-back.
  Both are trimmed. Target length 15.5-16.5 s.
- The end card's second line is twice its v1 size.
- Social exports at -10 LUFS for LinkedIn and X, which do not normalize.

## EDL
| Order | Source | In | Out | Content |
|---|---|---|---|---|
| 1 | S1_HAMMER | | | hammer taps (hook) |
| 2 | S2_GEARS | 1.042 | 3.042 | the gear is lowered and seats; ends 1.0 s after gear_drop (2.042), min shot 2.0 s |
| 3 | S3_CUCKOO | | | bird lands, calls twice, flies off |
| 4 | S4_MIDNIGHT | 0.000 | 4.583 | strike on the cut to the dial, pull-back; ends 0.5 s after the pull-back stops (4.083) |
| 5 | END_CARD | 0.00 | 1.50 | black card, see End card |

Empty in/out and all events come from `out/cues.md`. S2 starts 1.0 s before gear_drop so the shot
keeps the 2.0 s minimum and ends 1.0 s after the gear seats. Aim for roughly: S1 3.0 s, S2 2.0 s,
S3 4.5 s, S4 4.5 s.

## Audio map (times are detected event times from out/cues.md)
| Scene | Track | Voice | Text (send exactly) | At event | Offset | Gain |
|---|---|---|---|---|---|---|
| S1_HAMMER | A3 | sfx:hammer_tap | | tap_1, tap_2, tap_3 | 0.00 | |
| S2_GEARS | A3 | sfx:gear_seat | | gear_drop | 0.00 | |
| S2_GEARS | A3 | sfx:escapement | | step_* (every one) | 0.00 | |
| S3_CUCKOO | A3 | sfx:cuckoo_door | | bird_1 | -0.10 | |
| S3_CUCKOO | A3 | sfx:cuckoo_call | | bird_1, bird_2 | -0.05 | |
| S3_CUCKOO | A3 | sfx:wing_flutter | | fly_off | 0.00 | |
| S4_MIDNIGHT | A3 | sfx:midnight_strike | | midnight | 0.00 | |
| S4_MIDNIGHT | A2 | Narrator | `Right on the hour.` | midnight | 1.50 | +3 |
| END_CARD | A3 | sfx:escapement | | text_in | 0.00 | -4 |

Rules:
- SFX never move; they follow the picture. A hit that falls in a cut-out region is dropped and logged.
- The narrator never covers the strike's first 1.5 s. If the line would run past the end of S4, start it earlier (never before midnight + 1.5 s), else extend the S4 hold if frames are left, else let it finish over the end card.
- The narrator is 3 dB louder than in v1 and starts at the earliest allowed moment, midnight + 1.5 s.
- One soft single clock tick (an escapement take, 4 dB under the other ticks) lands on the frame the end card text finishes fading in (`text_in`).
- `cuckoo_call` offset -0.05 because the bellows note has a soft attack; the measured onset must land on the bird's furthest-out frame.

## Music and ambience
- Music (A4): `tense ticking music box and pizzicato strings, celesta melody, fast clockwork pulse, mysterious, rising toward a held suspended chord, 120 BPM, instrumental only, no vocals, 20 seconds`. Two takes, keep the one whose tempo is steadiest.
- Bed placement: beat 1 on timeline 0.00. Cuts between scenes may move at most ±3 frames toward the beat grid; SFX never move.
- Hard stop: the music ends on the `midnight` event (20 ms fade). After it, only the strike, its decay, the ambience and the narrator.
- Ambience (A5): `quiet night workshop room tone, dozens of distant clocks ticking softly out of sync, faint wind outside a small window`, 20 seconds, under the whole film including the end card at -30 dBFS RMS, 0.8 s fade out over the last 0.8 s of the end card.

## Mix levels before master normalization
A2 narrator -6 dBFS peak (the narrator row adds +3 dB, so -3 dBFS peak). A3 SFX -9 dBFS peak (midnight_strike -4 dBFS peak, the loudest moment of the film). A4 music -21 dBFS RMS, ducked 4 dB under the narrator. A5 ambience -30 dBFS RMS.

midnight_strike decay held to 1.2 dB/s from 0.5 s after its attack (lift at most 36 dB), so the strike keeps ringing into the end card.

midnight_strike ducked 4 dB under the narrator (the music's duck depth), so the line stays clear over the held decay.

## End card
1.5 s black, after S4. Two centered lines in a serif bold font (Windows `C:/Windows/Fonts/georgiab.ttf`, else DejaVu Serif Bold): `briefcut` (large), `brief in, film out` (5.4% of the frame height, 60% white). The second line is at least twice its v1 size so it reads on a phone. Text fades in over 0.25 s. No other text anywhere in the film.

## Export
`out/MIDNIGHT_master.mp4`: 1080x1920, 24 fps, H.264 CRF 18, yuv420p, AAC 192k 48 kHz. Two-pass loudnorm I=-14 TP=-1 LRA=11 (YouTube).
Social, for LinkedIn and X (no loudness normalization): `out/MIDNIGHT_social.mp4` (9:16) and `out/MIDNIGHT_16x9_social.mp4` (16:9): two-pass loudnorm I=-10 TP=-1 LRA=11, limiter, no clipping.
Also: `out/MIDNIGHT_preview_360p.mp4`, `out/MIDNIGHT_16x9.mp4` (the 9:16 film centred on a blurred 16:9 background, 1920x1080), `out/edl_sheet.jpg`, `out/sync_check.jpg`, `out/REPORT.md`, `out/SUMMARY.md`.

## QA (write to out/REPORT.md)
1. Duration 15.5-16.5 s.
2. -14 LUFS ±0.5, true peak ≤ -1 dBTP, no clipping.
3. Every event and cue placed or logged, with timeline times.
4. Every SFX onset within ±1 frame of its event frame, checked on sync_check.jpg from the master, not the premix.
5. Music silent after `midnight` (A4 below -60 dBFS from midnight + 20 ms).
6. midnight_strike is the loudest moment (momentary loudness, 400 ms).
7. First sound (tap_1) within the first 0.5 s.
8. First frame not black; last frame is the end card.
9. No audio from the source clips in the master.
10. Making-of numbers for the README: Flow takes used vs rejected, ElevenLabs characters used, SFX generations, total pipeline runtime.
11. Social exports: -10 LUFS ±0.5, true peak ≤ -1 dBTP, no clipping.
12. The last 3 s before the end card stay within 8 LU of the midnight_strike (momentary loudness).
