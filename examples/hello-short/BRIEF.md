# HELLO: briefcut demo short

A tiny film that runs with no key and no network: mock video (test patterns that flash white on
known frames) and mock audio (tones). It exercises the whole loop: clips, events, SFX on their
frames, a voice line, music on a beat grid with a hard stop, ambience, an end card, mastering,
exports and QA.

Video provider: mock
Audio provider: mock
Clip length: 3 s

## Goal
A 9:16 film, 6-12 s, 720x1280, 24 fps. Every flash gets its sound on its frame.

## Shot rules
Min shot: 2.0 s
Min dead cut: 0.75 s
Hard cuts only. The first frame of the film is at most 0.5 s before hit_1.

## Scenes

### S1_BLUE
A test pattern with two white flashes.
- Mock events: hit_1=6, hit_2=33

### S2_GREEN
A test pattern with four white flashes, about two per second.
- Mock events: tick_1=8, tick_2=20, tick_3=32, tick_4=44

### S3_RED
A test pattern with one white flash.
- Mock events: boom=10

## EDL
| Order | Source | In | Out | Content |
|---|---|---|---|---|
| 1 | S1_BLUE | | | two hits |
| 2 | S2_GREEN | | | four ticks |
| 3 | S3_RED | | | the boom, then the line |
| 4 | END_CARD | 0.00 | 1.00 | end card |

## Event detection
| Scene | Event name | What to look for |
|---|---|---|
| S1_BLUE | hit_1, hit_2 | first white frame |
| S2_GREEN | tick_1 .. tick_n | each white frame |
| S3_RED | boom | the white frame |

## ElevenLabs
Narrator: `eleven_multilingual_v2`, stability 0.55, similarity 0.80, style 0.15, speaker boost on, speed 0.95.
Narrator voice by name, first that exists in the account: `George`, `Daniel`.
Forced alignment on.

## SFX
| Name | Prompt | Seconds | Variants | Trim |
|---|---|---|---|---|
| hit | `short dry wooden knock` | 0.5 | 2 | transient |
| tick | `small clock tick, close` | 0.3 | 2 | transient |
| boom | `deep soft boom with a long tail` | 2.0 | 1 | transient |

## Audio map
| Scene | Track | Voice | Text | At event | Offset |
|---|---|---|---|---|---|
| S1_BLUE | A3 | sfx:hit | | hit_* | 0.00 |
| S2_GREEN | A3 | sfx:tick | | tick_* | 0.00 |
| S3_RED | A3 | sfx:boom | | boom | 0.00 |
| S3_RED | A2 | Narrator | `Brief in, film out.` | boom | 0.80 |

## Music and ambience
- Music (A4): `light pizzicato pulse, 120 BPM, instrumental only, 12 seconds`. One take.
- Bed placement: beat 1 on timeline 0.00. Cuts may move at most ±3 frames toward the beat grid.
- Hard stop: the music ends on the `boom` event (20 ms fade).
- Ambience (A5): `soft room tone`, 10 seconds, under the whole film at -32 dBFS RMS, 0.5 s fade out over the end card.

## Mix levels
A2 narrator -6 dBFS peak. A3 SFX -9 dBFS peak (boom -4 dBFS peak). A4 music -21 dBFS RMS, ducked 4 dB under the narrator. A5 ambience -32 dBFS RMS.

## End card
1.0 s black. Two centered lines: `briefcut` (large), `brief in, film out` (small, 60% white). Text fades in over 0.25 s.

## Export
`out/HELLO_master.mp4`: 720x1280, 24 fps, H.264 CRF 20, x264 preset veryfast, AAC 192k 48 kHz. Two-pass loudnorm I=-14 TP=-1 LRA=11.
Also `out/HELLO_preview_360p.mp4` and `out/HELLO_16x9.mp4`.
For platforms that do not normalize: `out/HELLO_social.mp4` and `out/HELLO_16x9_social.mp4`, two-pass loudnorm I=-10 TP=-1 LRA=11.

## QA
1. Duration 6-12 s.
2. -14 LUFS ±0.5, true peak ≤ -1 dBTP, no clipping.
3. Every event and cue placed or logged.
4. Every SFX onset within ±1 frame of its event frame, measured on the master.
5. Music silent after `boom`.
6. boom is the loudest moment (momentary loudness, 400 ms).
7. First sound (hit_1) within the first 0.5 s.
8. First frame not black; last frame is the end card.
9. No audio from the source clips in the master.
