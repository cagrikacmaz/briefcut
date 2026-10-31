# MIDNIGHT report

## Flagged for the owner

- **audio map row 1 (sfx:hammer_tap) plays at tap_* instead of tap_1, tap_2, tap_3: the chosen take shows seven hammer contacts in S1, not three; the brief's goal is that every sound on screen lands on its frame, so every contact gets a hammer_tap instead of leaving four visible taps silent (OVERRIDES.md)**
- **S2 step_1: not found on screen; placed on the closest moment that reads the same (see out/cues.md)**

Generated 2026-10-31T22:00:10.366Z by briefcut from `MIDNIGHT_BRIEF.md` (preset `default`, version 2).

## QA

| # | Check | Result | Detail |
|---|---|---|---|
| 1 | Duration 15.5-16.5 s | PASS | 15.500 s, 372 frames (EDL total 372) |
| 2 | Loudness -14 LUFS ±0.5, true peak ≤ -1 dBTP, no clipping | PASS | I -13.90 LUFS, TP -1.40 dBTP, LRA 5.20 LU (measured on the exported AAC); sample peak -1.40 dBFS, 0 samples at full scale |
| 3 | Every event and cue placed or logged | PASS | 16 placed, 0 dropped; 2 event(s) not found |
| 4 | Every sound within ±1 frame of its frame, measured on the master | PASS | worst 0.00 frames over 16 sounds; each sound located in the master by cross-correlation against the premix (see Cues), frames checked on sync_check.jpg |
| 5 | Music silent after the hard stop (A4 below -60 dBFS from midnight + 20 ms) | PASS | stop at 9.500 s; A4 peak afterwards digital silence |
| 6 | midnight_strike is the loudest moment (momentary loudness, 400 ms) | PASS | maximum M -8.33 LUFS at 9.800 s (window end); midnight_strike at 9.500 s |
| 7 | `MIDNIGHT_social_v2.mp4`: -10 LUFS ±0.5, true peak ≤ -1 dBTP, no clipping | PASS | I -10.10 LUFS, TP -1.60 dBTP, LRA 1.30 LU (exported AAC); sample peak -1.56 dBFS, 0 samples at full scale; limiter ceiling -4.5 dBTP, loudnorm pass 2 linear |
| 8 | `MIDNIGHT_16x9_social_v2.mp4`: -10 LUFS ±0.5, true peak ≤ -1 dBTP, no clipping | PASS | I -10.10 LUFS, TP -1.60 dBTP, LRA 1.30 LU (exported AAC); sample peak -1.56 dBFS, 0 samples at full scale; limiter ceiling -4.5 dBTP, loudnorm pass 2 linear |
| 9 | Last 3 s before the end card within 8 LU of midnight_strike (momentary loudness) | PASS | midnight_strike M -8.33 LUFS at 9.800 s; lowest M from 11.000 to 14.000 s -15.38 LUFS at 12.200 s (window end), 7.05 LU below |
| 10 | First sound (tap_1) within the first 0.5 s | PASS | tap_1 at 0.042 s |
| 11 | First frame not black; last frame is the end card | PASS | mean luma first 66.29, last 3.59 (0-255), brightest end-card pixel 252 |
| 12 | No audio from the source clips in the master | PASS | 1 audio stream in the master (the mix); picture rendered with -an, 4 source clip audio stream(s) never mapped |
| 13 | Hard cuts only: no speed change, freeze, reverse, zoom or transition | PASS | render graph holds trim, scale, colour, card text and concat only (out/work/render_graph.txt) |
| 14 | Min shot 2 s | PASS | shortest shot 2.000 s |
| 15 | Cuts on the music grid (±3 frames allowed) | PASS | worst cut 0.14 ms from a beat (one frame = 41.67 ms) |
| 16 | No silence below -50 dBFS longer than 1.5 s | PASS | none |
| 17 | Making-of numbers | n/a | takes used 4, rejected 3; elevenlabs audio: 18 TTS characters, 1 TTS, 12 SFX, 2 music, 1 ambience generations in the cache (0 made this run, 16 reused); est. 0.43 USD; runtime 63.98 s |

## Edit decision list (as rendered)

| # | Source | Listed in-out (s) | Rendered in-out (s) | Nudge in/out (frames) | Timeline (s) | Length (s) | Cut vs beat (ms) | Content | Note |
|---|---|---|---|---|---|---|---|---|---|
| 1 | S1_HAMMER | 0.000-3.000 | 0.000-3.000 | 0/0 | 0.000-3.000 | 3.000 | 0.03 | hammer taps (hook) | - |
| 2 | S2_GEARS | 1.042-3.042 | 1.042-3.042 | 0/0 | 3.000-5.000 | 2.000 | 0.05 | the gear is lowered and seats; ends 1.0 s after gear_drop (2.042), min shot 2.0 s | - |
| 3 | S3_CUCKOO | 0.375-4.875 | 0.375-4.875 | 0/0 | 5.000-9.500 | 4.500 | 0.10 | bird lands, calls twice, flies off | - |
| 4 | S4_MIDNIGHT | 0.000-4.583 | 0.000-4.500 | 0/-2 | 9.500-14.000 | 4.500 | 0.14 | strike on the cut to the dial, pull-back; ends 0.5 s after the pull-back stops (4.083) | - |
| 5 | END_CARD | 0.000-1.500 | 0.000-1.500 | 0/0 | 14.000-15.500 | 1.500 | - | black card, see End card | - |

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
| S2 | gear_drop | 2.042 | 49 | 4.000 | yes |
| S2 | step_1 | 2.542 | 61 | 4.500 | **not found**, closest moment |
| S3 | bird_1 | 0.583 | 14 | 5.208 | yes |
| S3 | bird_2 | 1.750 | 42 | 6.375 | yes |
| S3 | fly_off | 4.625 | 111 | 9.250 | yes |
| S4 | midnight | start (0.000) | 0 | 9.500 | yes |
| S4 | pullback | 1.000 | 24 | 10.500 | yes |
| S4 | pullback_end | 4.083 | 98 | 13.583 | yes |
| END_CARD | start | 0.000 | 0 | 14.000 | yes |
| END_CARD | text_in | 0.250 | 6 | 14.250 | yes |

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
| 2 | S2_GEARS | sfx:gear_seat | gear_drop | +0.00 | 4.000 | 4.000 | 4.000 | +0.00 | 0.00 | sfx_gear_seat_1.mp3 | placed | - |
| 3 | S2_GEARS | sfx:escapement | step_1 | +0.00 | 4.500 | 4.500 | 4.500 | +0.00 | 0.00 | sfx_escapement_1.mp3 | placed | - |
| 4 | S3_CUCKOO | sfx:cuckoo_door | bird_1 | -0.10 | 5.208 | 5.108 | 5.108 | +0.00 | 0.00 | sfx_cuckoo_door_1.mp3 | placed | - |
| 5.1 | S3_CUCKOO | sfx:cuckoo_call | bird_1 | -0.05 | 5.208 | 5.208 | 5.208 | +0.00 | 0.00 | sfx_cuckoo_call_1.mp3 | placed | offset -0.05 s not added: the measured attack (1 ms after the gated onset) is placed on the event frame |
| 5.2 | S3_CUCKOO | sfx:cuckoo_call | bird_2 | -0.05 | 6.375 | 6.375 | 6.375 | +0.00 | 0.00 | sfx_cuckoo_call_1.mp3 | placed | offset -0.05 s not added: the measured attack (1 ms after the gated onset) is placed on the event frame |
| 6 | S3_CUCKOO | sfx:wing_flutter | fly_off | +0.00 | 9.250 | 9.250 | 9.250 | +0.00 | 0.00 | sfx_wing_flutter_1.mp3 | placed | - |
| 7 | S4_MIDNIGHT | sfx:midnight_strike | midnight | +0.00 | 9.500 | 9.500 | 9.500 | +0.00 | 0.00 | sfx_midnight_strike_1.mp3 | placed | decay held to 1.2 dB/s; ducked 4 dB under the voices |
| 8 | S4_MIDNIGHT | Narrator `Right on the hour.` | midnight | +1.50 | 9.500 | 11.000 | 11.000 | +0.00 | 0.00 | vo_8_narrator.mp3 | placed | voice George - Warm, Captivating Storyteller; gain +3 dB (peak -3 dBFS) |
| 9 | END_CARD | sfx:escapement | text_in | +0.00 | 14.250 | 14.250 | 14.250 | +0.00 | 0.00 | sfx_escapement_2.mp3 | placed | gain -4 dB |

## Mix and master

- A2 voices peak-normalized to -6 dBFS; A3 effects to -9 dBFS peak (midnight_strike -4).
- A4 music: take 1 of 2 (steadiest: local tempo spread take 1 0.04 BPM, take 2 0.15 BPM); 120.00 BPM detected, downbeat at 0.017 s of the file placed on timeline 0.000 s; -21 dBFS RMS where it plays (gain -3.55 dB), ducked up to 4.00 dB under the voices; hard stop at 9.500 s with a 20 ms fade.
- A5 ambience at -30 dBFS RMS under the whole film (gain 20.99 dB), 0.8 s fade out at the end.
- Pre-master -15.13 LUFS / 0.44 dBTP; gain 1.13 dB; limiter ceiling -1.5 dBTP at 4x oversampling (latency compensated); loudnorm pass 2 output -13.90 LUFS, -1.46 dBTP, mode linear.
- Decay held: midnight_strike falls no faster than 1.2 dB/s from 0.5 s after its loudest 50 ms (lift at most 36 dB).
- Effects ducked under the voices: midnight_strike 4 dB (same key and timing as the music duck).
- Export: `out/MIDNIGHT_master_v2.mp4` 1080x1920, 24 fps, H.264 CRF 18 (slow), yuv420p, BT.709, AAC 192k 48 kHz; `out/MIDNIGHT_preview_360p_v2.mp4`; `out/MIDNIGHT_16x9_v2.mp4` (16:9, blurred background).
- Extra loudness target: `out/MIDNIGHT_social_v2.mp4` at -10 LUFS / -1 dBTP, mastered from the same premaster (gain 9.97 dB, limiter ceiling -4.5 dBTP); measured I -10.10 LUFS, TP -1.60 dBTP.
- Extra loudness target: `out/MIDNIGHT_16x9_social_v2.mp4` at -10 LUFS / -1 dBTP, mastered from the same premaster (gain 9.97 dB, limiter ceiling -4.5 dBTP); measured I -10.10 LUFS, TP -1.60 dBTP.
- End card: 1.5 s, font `georgiab.ttf`, "briefcut" (large), "brief in, film out" (5.4%, 60%), fade in 0.25 s.
- FIX passes applied: `MIDNIGHT_FIX01.md`.

## Momentary loudness, last 5 s

Master, 400 ms windows, value at the window end. End card from 14.000 s. Reference: midnight_strike M -8.33 LUFS.

| t (s) | M (LUFS) | Below reference (LU) |
|---|---|---|
| 10.60 | -9.42 | 1.09 |
| 10.80 | -9.78 | 1.45 |
| 11.00 | -10.16 | 1.83 |
| 11.20 | -10.64 | 2.31 |
| 11.40 | -11.55 | 3.22 |
| 11.60 | -13.17 | 4.84 |
| 11.80 | -14.26 | 5.93 |
| 12.00 | -14.94 | 6.61 |
| 12.20 | -15.38 | 7.05 |
| 12.40 | -14.48 | 6.15 |
| 12.60 | -13.13 | 4.80 |
| 12.80 | -12.53 | 4.20 |
| 13.00 | -12.50 | 4.17 |
| 13.20 | -12.85 | 4.52 |
| 13.40 | -13.36 | 5.03 |
| 13.60 | -13.61 | 5.28 |
| 13.80 | -13.87 | 5.53 |
| 14.00 | -14.09 | 5.76 |
| 14.20 | -14.32 | 5.99 |
| 14.40 | -15.18 | 6.84 |
| 14.60 | -17.55 | 9.22 |
| 14.80 | -21.16 | 12.83 |
| 15.00 | -24.29 | 15.96 |
| 15.20 | -28.98 | 20.65 |
| 15.40 | -37.49 | 29.16 |

## Decisions and log

- **override**: audio map row 1 (sfx:hammer_tap) plays at tap_* instead of tap_1, tap_2, tap_3: the chosen take shows seven hammer contacts in S1, not three; the brief's goal is that every sound on screen lands on its frame, so every contact gets a hammer_tap instead of leaving four visible taps silent (OVERRIDES.md)
- **clip audio**: 4 source clip(s) carry an audio stream (S1_HAMMER.mp4, S2_GEARS.mp4, S3_CUCKOO.mp4, S4_MIDNIGHT.mp4); it is discarded, as the brief says
- **soft attack**: cue 5.1 cuckoo_call: the brief's -0.05 s offset compensates a soft attack; briefcut places the measured attack on the event frame instead (attack 1 ms after the gated onset in this take)
- **soft attack**: cue 5.2 cuckoo_call: the brief's -0.05 s offset compensates a soft attack; briefcut places the measured attack on the event frame instead (attack 1 ms after the gated onset in this take)
