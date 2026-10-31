# MIDNIGHT FIX02: a deeper, clearer narrator

Revision pass after review of v2. Audio only: the picture, every SFX placement, the tail rule and
both loudness targets stay as in v2. Each `##` section below replaces the section of the same name
(after FIX01). Renders as version 3 (`_v3`).

What changes and why: the narrator is thin and too quiet. A deeper, warmer voice is chosen by
audition, the line is louder with a little low end, and the strike makes more room under it.

## ElevenLabs
Narrator: `eleven_multilingual_v2`, stability 0.6, similarity 0.8, style 0.1, speaker boost on, speed 0.9.
Narrator voice by audition, lowest and fullest: `Daniel`, `Adam`, `Bill`, `Brian`. Forced alignment on.

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
| S4_MIDNIGHT | A2 | Narrator | `Right on the hour.` | midnight | 1.50 | |
| END_CARD | A3 | sfx:escapement | | text_in | 0.00 | -4 |

Rules:
- SFX never move; they follow the picture. A hit that falls in a cut-out region is dropped and logged.
- The narrator never covers the strike's first 1.5 s. If the line would run past the end of S4, start it earlier (never before midnight + 1.5 s), else extend the S4 hold if frames are left, else let it finish over the end card.
- The narrator starts at the earliest allowed moment, midnight + 1.5 s.
- One soft single clock tick (an escapement take, 4 dB under the other ticks) lands on the frame the end card text finishes fading in (`text_in`).
- `cuckoo_call` offset -0.05 because the bellows note has a soft attack; the measured onset must land on the bird's furthest-out frame.

## Mix levels before master normalization
A2 narrator -3 dBFS peak. A3 SFX -9 dBFS peak (midnight_strike -4 dBFS peak, the loudest moment of the film). A4 music -21 dBFS RMS, ducked 4 dB under the narrator. A5 ambience -30 dBFS RMS.

Narrator low shelf +2 dB at 150 Hz.

Narrator compressed 6:1 above -30 dBFS (5 ms attack, 80 ms release), so the end of the line is as present as its start.

midnight_strike decay held to 0.3 dB/s from 0.5 s after its attack (lift at most 36 dB), so the strike keeps ringing into the end card.

midnight_strike ducked 6 dB under the narrator (150 ms attack, 600 ms release, 40 ms hold, key -24 dBFS), 18 dB more in the speech band 300-3000 Hz (20 ms attack, 60 ms release), so the line reads clearly over the held decay.

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
13. The narrator reads over the midnight_strike on a phone speaker: speech band 300-3000 Hz of the line at least 6 dB above the strike in the line's window.
