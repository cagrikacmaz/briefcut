# MIDNIGHT report

## Flagged for the owner

- **audio map row 1 (sfx:hammer_tap) plays at tap_* instead of tap_1, tap_2, tap_3: the chosen take shows seven hammer contacts in S1, not three; the brief's goal is that every sound on screen lands on its frame, so every contact gets a hammer_tap instead of leaving four visible taps silent (OVERRIDES.md)**
- **S2 step_1, step_2, step_3, step_4, step_5, step_6: not found on screen; placed on the closest moment that reads the same (see out/cues.md)**

Generated 2026-10-31T14:46:13.910Z by briefcut from `MIDNIGHT_BRIEF.md` (preset `default`, version 1).

## QA

| # | Check | Result | Detail |
|---|---|---|---|
| 1 | Duration 15-20 s | PASS | 17.750 s, 426 frames (EDL total 426) |
| 2 | Loudness -14 LUFS ±0.5, true peak ≤ -1 dBTP, no clipping | PASS | I -14.00 LUFS, TP -1.30 dBTP, LRA 8.90 LU (measured on the exported AAC); sample peak -1.26 dBFS, 0 samples at full scale |
| 3 | Every event and cue placed or logged | PASS | 20 placed, 0 dropped; 2 event(s) not found |
| 4 | Every sound within ±1 frame of its frame, measured on the master | PASS | worst 0.00 frames over 20 sounds; each sound located in the master by cross-correlation against the premix (see Cues), frames checked on sync_check.jpg |
| 5 | Music silent after the hard stop (A4 below -60 dBFS from midnight + 20 ms) | PASS | stop at 11.000 s; A4 peak afterwards digital silence |
| 6 | midnight_strike is the loudest moment (momentary loudness, 400 ms) | PASS | maximum M -7.42 LUFS at 11.300 s (window end); midnight_strike at 11.000 s |
| 7 | First sound (tap_1) within the first 0.5 s | PASS | tap_1 at 0.042 s |
| 8 | First frame not black; last frame is the end card | PASS | mean luma first 66.29, last 2.27 (0-255), brightest end-card pixel 252 |
| 9 | No audio from the source clips in the master | PASS | 1 audio stream in the master (the mix); picture rendered with -an, 4 source clip audio stream(s) never mapped |
| 10 | Hard cuts only: no speed change, freeze, reverse, zoom or transition | PASS | render graph holds trim, scale, colour, card text and concat only (out/work/render_graph.txt) |
| 11 | Min shot 2 s | PASS | shortest shot 3.000 s |
| 12 | Cuts on the music grid (±3 frames allowed) | PASS | worst cut 0.16 ms from a beat (one frame = 41.67 ms) |
| 13 | No silence below -50 dBFS longer than 1.5 s | PASS | none |
| 14 | Making-of numbers | n/a | takes used 4, rejected 3; elevenlabs audio: 18 TTS characters, 1 TTS, 12 SFX, 2 music, 1 ambience generations in the cache (0 made this run, 16 reused); est. 0.43 USD; runtime 49.05 s |

## Edit decision list (as rendered)

| # | Source | Listed in-out (s) | Rendered in-out (s) | Nudge in/out (frames) | Timeline (s) | Length (s) | Cut vs beat (ms) | Content | Note |
|---|---|---|---|---|---|---|---|---|---|
| 1 | S1_HAMMER | 0.000-3.000 | 0.000-3.000 | 0/0 | 0.000-3.000 | 3.000 | 0.03 | three hammer taps (hook) | - |
| 2 | S2_GEARS | 1.750-5.250 | 1.750-5.250 | 0/0 | 3.000-6.500 | 3.500 | 0.07 | last gear drops in, escapement steps | - |
| 3 | S3_CUCKOO | 0.375-4.875 | 0.375-4.875 | 0/0 | 6.500-11.000 | 4.500 | 0.11 | bird pops out, calls twice, flies off | - |
| 4 | S4_MIDNIGHT | 0.000-5.000 | 0.000-5.000 | 0/0 | 11.000-16.000 | 5.000 | 0.16 | hands meet at XII, pendulums in unison, pull-back | - |
| 5 | END_CARD | 0.000-1.750 | 0.000-1.750 | 0/0 | 16.000-17.750 | 1.750 | - | black card, see End card | - |

## Events

From `out/cues.md` (2 fps sheets, then 8 and 24 fps strips). Timeline = where the event frame lands in the cut.

| Clip | Event | Source t (s) | Source frame | Timeline (s) | Found |
|---|---|---|---|---|---|
| S1 | tap_1 | 0.042 | 1 | 0.042 | yes |
| S1 | tap_2 | 0.542 | 13 | 0.542 | yes |
| S1 | tap_3 | 1.000 | 24 | 1.000 | yes |
| S1 | tap_4 | 1.500 | 36 | 1.500 | yes |
| S1 | tap_5 | 2.000 | 48 | 2.000 | yes |
| S1 | tap_6 | 2.500 | 60 | 2.500 | yes |
| S1 | tap_7 | 2.958 | 71 | 2.958 | yes |
| S2 | gear_drop | 2.042 | 49 | 3.292 | yes |
| S2 | step_1 | 2.250 | 54 | 3.500 | **not found**, closest moment |
| S2 | step_2 | 2.750 | 66 | 4.000 | **not found**, closest moment |
| S2 | step_3 | 3.250 | 78 | 4.500 | **not found**, closest moment |
| S2 | step_4 | 3.750 | 90 | 5.000 | **not found**, closest moment |
| S2 | step_5 | 4.250 | 102 | 5.500 | **not found**, closest moment |
| S2 | step_6 | 4.750 | 114 | 6.000 | **not found**, closest moment |
| S3 | bird_1 | 0.583 | 14 | 6.708 | yes |
| S3 | bird_2 | 1.750 | 42 | 7.875 | yes |
| S3 | fly_off | 4.625 | 111 | 10.750 | yes |
| S4 | midnight | start (0.000) | 0 | 11.000 | yes |
| S4 | pullback | 1.000 | 24 | 12.000 | yes |

## Cues

Times in timeline seconds. Picture = the event frame. Target = picture + offset: where the sound must be heard to start. Effects are placed by their attack point (the first 5 ms window within 10 dB of the loudest window of the trimmed take), voices by their gated onset. Heard = where that point sits in the master: the take's first 80 ms are located in the master audio by cross-correlation (shift column) and the shift is added to the target. Error = heard - target, in frames. The frames themselves are verified by eye on sync_check.jpg, cut from the master.

| # | Scene | Sound | Event | Offset | Picture | Target | Heard | Error (frames) | Shift in master (ms) | Variant / file | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1.1 | S1_HAMMER | sfx:hammer_tap | tap_1 | +0.00 | 0.042 | 0.042 | 0.042 | +0.00 | 0.00 | sfx_hammer_tap_1.mp3 | placed | - |
| 1.2 | S1_HAMMER | sfx:hammer_tap | tap_2 | +0.00 | 0.542 | 0.542 | 0.542 | +0.00 | 0.00 | sfx_hammer_tap_2.mp3 | placed | - |
| 1.3 | S1_HAMMER | sfx:hammer_tap | tap_3 | +0.00 | 1.000 | 1.000 | 1.000 | +0.00 | 0.00 | sfx_hammer_tap_3.mp3 | placed | - |
| 1.4 | S1_HAMMER | sfx:hammer_tap | tap_4 | +0.00 | 1.500 | 1.500 | 1.500 | +0.00 | 0.00 | sfx_hammer_tap_1.mp3 | placed | - |
| 1.5 | S1_HAMMER | sfx:hammer_tap | tap_5 | +0.00 | 2.000 | 2.000 | 2.000 | +0.00 | 0.00 | sfx_hammer_tap_2.mp3 | placed | - |
| 1.6 | S1_HAMMER | sfx:hammer_tap | tap_6 | +0.00 | 2.500 | 2.500 | 2.500 | +0.00 | 0.00 | sfx_hammer_tap_3.mp3 | placed | - |
| 1.7 | S1_HAMMER | sfx:hammer_tap | tap_7 | +0.00 | 2.958 | 2.958 | 2.958 | +0.00 | 0.00 | sfx_hammer_tap_1.mp3 | placed | - |
| 2 | S2_GEARS | sfx:gear_seat | gear_drop | +0.00 | 3.292 | 3.292 | 3.292 | +0.00 | 0.00 | sfx_gear_seat_1.mp3 | placed | - |
| 3.1 | S2_GEARS | sfx:escapement | step_1 | +0.00 | 3.500 | 3.500 | 3.500 | +0.00 | 0.00 | sfx_escapement_1.mp3 | placed | - |
| 3.2 | S2_GEARS | sfx:escapement | step_2 | +0.00 | 4.000 | 4.000 | 4.000 | +0.00 | 0.00 | sfx_escapement_2.mp3 | placed | - |
| 3.3 | S2_GEARS | sfx:escapement | step_3 | +0.00 | 4.500 | 4.500 | 4.500 | +0.00 | 0.00 | sfx_escapement_3.mp3 | placed | - |
| 3.4 | S2_GEARS | sfx:escapement | step_4 | +0.00 | 5.000 | 5.000 | 5.000 | +0.00 | 0.00 | sfx_escapement_1.mp3 | placed | - |
| 3.5 | S2_GEARS | sfx:escapement | step_5 | +0.00 | 5.500 | 5.500 | 5.500 | +0.00 | 0.00 | sfx_escapement_2.mp3 | placed | - |
| 3.6 | S2_GEARS | sfx:escapement | step_6 | +0.00 | 6.000 | 6.000 | 6.000 | +0.00 | 0.00 | sfx_escapement_3.mp3 | placed | - |
| 4 | S3_CUCKOO | sfx:cuckoo_door | bird_1 | -0.10 | 6.708 | 6.608 | 6.608 | +0.00 | 0.00 | sfx_cuckoo_door_1.mp3 | placed | - |
| 5.1 | S3_CUCKOO | sfx:cuckoo_call | bird_1 | -0.05 | 6.708 | 6.708 | 6.708 | +0.00 | 0.00 | sfx_cuckoo_call_1.mp3 | placed | offset -0.05 s not added: the measured attack (1 ms after the gated onset) is placed on the event frame |
| 5.2 | S3_CUCKOO | sfx:cuckoo_call | bird_2 | -0.05 | 7.875 | 7.875 | 7.875 | +0.00 | 0.00 | sfx_cuckoo_call_1.mp3 | placed | offset -0.05 s not added: the measured attack (1 ms after the gated onset) is placed on the event frame |
| 6 | S3_CUCKOO | sfx:wing_flutter | fly_off | +0.00 | 10.750 | 10.750 | 10.750 | +0.00 | 0.00 | sfx_wing_flutter_1.mp3 | placed | - |
| 7 | S4_MIDNIGHT | sfx:midnight_strike | midnight | +0.00 | 11.000 | 11.000 | 11.000 | +0.00 | 0.00 | sfx_midnight_strike_1.mp3 | placed | - |
| 8 | S4_MIDNIGHT | Narrator `Right on the hour.` | midnight | +1.80 | 11.000 | 12.800 | 12.800 | +0.00 | 0.00 | vo_8_narrator.mp3 | placed | voice George - Warm, Captivating Storyteller |

## Mix and master

- A2 voices peak-normalized to -6 dBFS; A3 effects to -9 dBFS peak (midnight_strike -4).
- A4 music: take 1 of 2 (steadiest: local tempo spread take 1 0.04 BPM, take 2 0.15 BPM); 120.00 BPM detected, downbeat at 0.017 s of the file placed on timeline 0.000 s; -21 dBFS RMS where it plays (gain -3.51 dB), ducked up to 4.00 dB under the voices; hard stop at 11.000 s with a 20 ms fade.
- A5 ambience at -30 dBFS RMS under the whole film (gain 21.19 dB), 1 s fade out at the end.
- Pre-master -16.08 LUFS / -0.52 dBTP; gain 2.08 dB; limiter ceiling -1.5 dBTP at 4x oversampling (latency compensated); loudnorm pass 2 output -13.98 LUFS, -1.45 dBTP, mode linear.
- Export: `out/MIDNIGHT_master.mp4` 1080x1920, 24 fps, H.264 CRF 18 (slow), yuv420p, BT.709, AAC 192k 48 kHz; `out/MIDNIGHT_preview_360p.mp4`; `out/MIDNIGHT_16x9.mp4` (16:9, blurred background).
- End card: 1.75 s, font `georgiab.ttf`, "briefcut" (large), "brief in, film out" (small, 60%), fade in 0.25 s.

## Decisions and log

- **override**: audio map row 1 (sfx:hammer_tap) plays at tap_* instead of tap_1, tap_2, tap_3: the chosen take shows seven hammer contacts in S1, not three; the brief's goal is that every sound on screen lands on its frame, so every contact gets a hammer_tap instead of leaving four visible taps silent (OVERRIDES.md)
- **clip audio**: 4 source clip(s) carry an audio stream (S1_HAMMER.mp4, S2_GEARS.mp4, S3_CUCKOO.mp4, S4_MIDNIGHT.mp4); it is discarded, as the brief says
- **soft attack**: cue 5.1 cuckoo_call: the brief's -0.05 s offset compensates a soft attack; briefcut places the measured attack on the event frame instead (attack 1 ms after the gated onset in this take)
- **soft attack**: cue 5.2 cuckoo_call: the brief's -0.05 s offset compensates a soft attack; briefcut places the measured attack on the event frame instead (attack 1 ms after the gated onset in this take)
