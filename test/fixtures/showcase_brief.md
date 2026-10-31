# CLOCK: test brief in the showcase shape

## Goal
A 9:16 film, 15-20 s, from silent clips. Aim for roughly: S1 3.0 s, S2 4.0 s.

## Shot rules
Min shot: 2.0 s
Min dead cut: 0.75 s
Hard cuts only. No zooms, speed changes, freezes or reversed footage. The first frame of the film is at most 0.5 s before tap_1.

## EDL
| Order | Source | In | Out | Content |
|---|---|---|---|---|
| 1 | S1_HAMMER | | | taps |
| 2 | S2_BIRD | | | bird |
| 3 | END_CARD | 0.00 | 1.75 | card |

## Event detection
| Scene | Event name | What to look for |
|---|---|---|
| S1_HAMMER | tap_1, tap_2, tap_3 | first contact frame |
| S2_BIRD | step_1 .. step_n | each step |
| S2_BIRD | strike | first frame of S2 in the edit |

## ElevenLabs
Narrator: `eleven_multilingual_v2`, stability 0.55, similarity 0.80, style 0.15, speaker boost on, speed 0.9.
Narrator voice by name, first that exists in the account: `VoiceA`, `VoiceB`, `VoiceC`. Log which one was used. Forced alignment on.

## SFX
| Name | Prompt | Seconds | Variants | Trim |
|---|---|---|---|---|
| hammer_tap | `tiny hammer on brass, close, dry` | 0.6 | 3 | transient |
| call | `one bird call, warm` | 1.2 | 1 | onset |
| big_strike | `many bells at once, long decay` | 6.0 | 2 | transient |

## Audio map
| Scene | Track | Voice | Text (send exactly) | At event | Offset |
|---|---|---|---|---|---|
| S1_HAMMER | A3 | sfx:hammer_tap | | tap_1, tap_2, tap_3 | 0.00 |
| S2_BIRD | A3 | sfx:call | | step_* (every one) | -0.05 |
| S2_BIRD | A3 | sfx:big_strike | | strike | 0.00 |
| S2_BIRD | A2 | Narrator | `Right on time.` | strike | 1.80 |

Rules:
- The narrator never covers the strike's first 1.5 s. If the line would run past the end of S2, start it earlier, else extend the S2 hold if frames are left, else let it finish over the end card.

## Music and ambience
- Music (A4): `ticking music box, 120 BPM, instrumental only, no vocals, 20 seconds`. Two takes, keep the one whose tempo is steadiest.
- Bed placement: beat 1 on timeline 0.00. Cuts between scenes may move at most ±3 frames toward the beat grid; SFX never move.
- Hard stop: the music ends on the `strike` event (20 ms fade).
- Ambience (A5): `quiet room tone`, 20 seconds, under the whole film at -30 dBFS RMS, 1.0 s fade out over the end card.

## Mix levels before master normalization
A2 narrator -6 dBFS peak. A3 SFX -9 dBFS peak (big_strike -4 dBFS peak, the loudest moment of the film). A4 music -21 dBFS RMS, ducked 4 dB under the narrator. A5 ambience -30 dBFS RMS.

## End card
1.75 s black, after S2. Two centered lines in a serif bold font: `briefcut` (large), `brief in, film out` (small, 60% white). Text fades in over 0.25 s.

## Export
`out/CLOCK_master.mp4`: 1080x1920, 24 fps, H.264 CRF 18, yuv420p, AAC 192k 48 kHz. Two-pass loudnorm I=-14 TP=-1 LRA=11.
Also: `out/CLOCK_preview_360p.mp4`, `out/CLOCK_16x9.mp4`.

## QA
1. Duration 15-20 s.
2. -14 LUFS ±0.5, true peak ≤ -1 dBTP, no clipping.
4. Every SFX onset within ±1 frame of its event frame.
6. big_strike is the loudest moment (momentary loudness, 400 ms).
9. No audio from the source clips in the master.
