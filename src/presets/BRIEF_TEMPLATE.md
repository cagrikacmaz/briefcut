# FILM: one-line idea of the film

Everything the pipeline does comes from this file. Write what you want; what you leave out comes
from the preset (src/presets/default.json) and is logged in OPEN_QUESTIONS.md, never asked.
Format reference: docs/BRIEF_FORMAT.md.

Video provider: handoff
Video model: veo-3.1-quality
Clip length: 8 s

## Goal
A 9:16 film, 15-20 s, 1080x1920, 24 fps. What the viewer should feel, and the one thing that must be right.

## Shot rules
Min shot: 2.0 s
Min dead cut: 0.75 s
Hard cuts only. The first frame of the film is at most 0.5 s before hit_1.

## Shared style
Lighting, lens, palette, mood. Appended to every scene prompt. No text, no captions, no logos.

## Scenes

### S1_FIRST
What happens, where, the camera. Name the action you will sync to and roughly when it happens.

### S2_SECOND
...

## EDL
| Order | Source | In | Out | Content |
|---|---|---|---|---|
| 1 | S1_FIRST | | | the hook |
| 2 | S2_SECOND | | | the payoff |
| 3 | END_CARD | 0.00 | 1.50 | end card |

## Event detection
| Scene | Event name | What to look for |
|---|---|---|
| S1_FIRST | hit_1, hit_2 | first frame of contact |
| S2_SECOND | payoff | first frame the payoff is visible |

## ElevenLabs
Narrator: `eleven_multilingual_v2`, stability 0.55, similarity 0.80, style 0.15, speaker boost on, speed 0.95.
Narrator voice by name, first that exists in the account: `George`, `Daniel`, `Brian`.
Forced alignment on.

## SFX
| Name | Prompt | Seconds | Variants | Trim |
|---|---|---|---|---|
| hit | `describe the sound, close, dry` | 0.6 | 2 | transient |

## Audio map
| Scene | Track | Voice | Text | At event | Offset |
|---|---|---|---|---|---|
| S1_FIRST | A3 | sfx:hit | | hit_* | 0.00 |
| S2_SECOND | A2 | Narrator | `One short line.` | payoff | 0.50 |

## Music and ambience
- Music (A4): `style, instruments, mood, 120 BPM, instrumental only, no vocals, 20 seconds`. Two takes, keep the one whose tempo is steadiest.
- Bed placement: beat 1 on timeline 0.00. Cuts may move at most ±3 frames toward the beat grid; SFX never move.
- Ambience (A5): `room tone of the place`, 20 seconds, under the whole film at -30 dBFS RMS, 1.0 s fade out over the end card.

## Mix levels
A2 narrator -6 dBFS peak. A3 SFX -9 dBFS peak. A4 music -21 dBFS RMS, ducked 4 dB under the narrator. A5 ambience -30 dBFS RMS.

## End card
1.5 s black. Two centered lines: `Title` (large), `subtitle` (small, 60% white). Text fades in over 0.25 s.

## Export
`out/FILM_master.mp4`: 1080x1920, 24 fps, H.264 CRF 18, AAC 192k 48 kHz. Two-pass loudnorm I=-14 TP=-1 LRA=11.
Also `out/FILM_preview_360p.mp4` and `out/FILM_16x9.mp4`.

## QA
1. Duration 15-20 s.
2. -14 LUFS ±0.5, true peak ≤ -1 dBTP, no clipping.
3. Every event and cue placed or logged.
4. Every SFX onset within ±1 frame of its event frame, measured on the master.
5. First frame not black; last frame is the end card.
6. No audio from the source clips in the master.
