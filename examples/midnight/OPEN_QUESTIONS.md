# Open questions

What the brief did not settle, and what was decided instead of asking. Edit the brief or answer here, then run again.

## Decided by the agent (event detection and edit)

- **S1 taps**: the take taps continuously, every 11-12 frames, not three times; the 2 fps sheet aliases it (tiles are 12 frames apart). Seven contacts fall in 0-3.0 s and all get a hammer_tap (OVERRIDES.md), because a visible silent tap breaks the film's point. S1 ends on frame 72, one frame after tap_7: a cut on the hit.
- **S2 steps**: no discrete escapement step is visible (the balance wheel turns continuously, out of focus). The ticks sit on the music's beats (120.00 BPM, exactly 0.5 s apart), two per second as the brief asks, flagged as not found.
- **S2 range**: 1.75-5.25 s (3.5 s as aimed). It skips the 1.25 s still stretch before the drop (frames 18-47) instead of cutting inside the shot.
- **S3 bird_1**: the bird flies in from the right edge; first pixels at f10-f11, first frame over the dial f14 (0.583 s), used for bird_1.
- **S3 bird_2**: the bird leans out twice (f42 and f81); the first lean is call 2 so the two calls are 1.17 s apart and do not run into each other. The second lean is silent.
- **S3 length**: 4.5 s instead of the aimed 4.0 s, so the fly-off (f111) and the empty dial after it (f114) are in the shot.
- **Colour**: the default preset applies no grade and no shot match; the four clips keep their own night looks (warm workshop, brass macro, wall, cool hall).

## Decided by the agent for v2 (MIDNIGHT_FIX01.md)

- **S2 range v2**: 1.042-3.042 s. The owner asked for S2 to end about 1 s after gear_drop (2.042) with the 2.0 s minimum shot, so the shot starts 1.0 s before the drop, on the tweezers lowering the gear, instead of ending later on the static hold. The gear seats on the beat at timeline 4.0 s.
- **S2 step v2**: one escapement tick at 2.542 s (the only beat after the gear seats inside the shot, timeline 4.5 s), still flagged not found. The v1 sheet is kept as out/v1/cues.md.
- **S4 end**: the pull-back eases out; its stop is taken as the first frame whose motion falls below a third of its peak (f98, 4.083 s). Out point 4.583 s (stop + 0.5 s), which briefcut snapped 2 frames to 4.500 s, on the beat at 14.0 s: the wide shot ends 0.42 s after the stop. Length 15.5 s, the bottom of the 15.5-16.5 s target.
- **Strike ring**: the brief allowed the strike's own decay at a higher level or a second long bell take; the own decay needs no new paid generation, so the take's tail is held to fall no faster than 1.2 dB/s (at most 36 dB of lift) and ducked 4 dB under the narrator. A first render at 1.5 dB/s with a 6 dB duck dipped to 9.35 LU below the strike at 12.2 s, just after the line; 1.2 dB/s with the music's 4 dB duck stays within 7.05 LU.
- **End tick**: an escapement take at -4 dB (-13 dBFS peak, against -9 for the other ticks) on card frame 6, where the text is fully in (0.25 s fade).
- **End card line 2**: 5.4% of the frame height, 104 px against 50 px in v1 (2.08x); it spans about 80% of the frame width, so it was not made larger.
- **Social true peak**: the meter prints true peak to 0.1 dB. The first social render that read -1.0 dBTP had a sample peak of -0.97 dBFS, so the true peak was above -1. briefcut now counts the sample peak in the true-peak rule; the social masters settled at a -4.5 dBTP limiter ceiling (TP -1.6 dBTP, sample peak -1.56 dBFS, LRA 1.3 LU).

## Decided by the agent for v3 (MIDNIGHT_FIX02.md)

- **Narrator voice, by audition** (`briefcut prepare`, full table in out/AUDITION.md). The line "Right on the hour." with each candidate, eleven_multilingual_v2, stability 0.6, similarity 0.8, style 0.1, speed 0.9, measured over its voiced frames:

  | Candidate | Voice in the account | Fundamental | Spectral centroid | Low share (80-300 Hz) |
  |---|---|---|---|---|
  | Daniel | Daniel - Steady Broadcaster | 124.0 Hz | 1465 Hz | 81.6% |
  | **Adam (picked)** | Adam Stone - Smooth, Deep, and Relaxed | 90.1 Hz | 1424 Hz | 49.9% |
  | Bill | Bill - Wise, Mature, Balanced | 241.2 Hz | 1752 Hz | 40.6% |
  | Brian | Brian - Deep, Resonant and Comforting | 133.7 Hz | 1676 Hz | 43.6% |

  Adam has both the lowest fundamental and the lowest centroid, so it is the lowest voice on both measures. Daniel has the largest share below 300 Hz but sits 34 Hz higher. Bill's 241 Hz is probably an octave error of the pitch tracker on a breathy take; Bill has the highest centroid either way, so the pick does not depend on it. Cost: 4 lines, 72 characters, about 0.01 USD; Adam's take is the one the cut uses (cached, not paid twice), with its own forced alignment.
- **Clear over the bell (speech band 300-3000 Hz, the band a phone speaker reproduces).** With the owner's settings alone (narrator -3 dBFS peak, low shelf +2 dB at 150 Hz, strike ducked 6 dB with 150 ms attack and 600 ms release) the line measured 1.09 dB *under* the strike in that band, and the dip after the line was 9.08 LU (tail rule 8). The held decay keeps the bell near its peak where the line sits. Kept the owner's broadband duck as given and added, in this order of renders: a deeper duck in the speech band only (zero-phase band split, so the rest of the bell keeps the 6 dB duck); its own fast attack and release (20/60 ms) so the band clears under the first word and comes back as soon as the line ends; a 40 ms hold and a -24 dBFS key so the duck follows the line rather than its breath tail; a narrator compressor (6:1 above -30 dBFS) so the end of the line is as present as its start; and the held decay at 0.3 dB/s (was 1.2) so the bell is full again right after the line. Measured: speech band +6.44 dB for the line over the strike (QA threshold 6 dB, set before these renders), tail 7.15 LU. The bell sounds hollower under the line, which is the trade for a clear line on a phone.
- **Renders**: ten v3 renders while tuning (picture reused from v2, no paid call after the audition); each replaced the previous v3 files (the last three kept in out/work/prev), and only the last is delivered as MIDNIGHT_*_v3. Every SFX frame and sync_check.jpg are unchanged from v2 (byte-identical image, 16 of 16 cue times equal).

<!-- briefcut:start -->
## Decided by briefcut

- **override**: audio map row 1 (sfx:hammer_tap) plays at tap_* instead of tap_1, tap_2, tap_3: the chosen take shows seven hammer contacts in S1, not three; the brief's goal is that every sound on screen lands on its frame, so every contact gets a hammer_tap instead of leaving four visible taps silent (OVERRIDES.md)
- **clip audio**: 4 source clip(s) carry an audio stream (S1_HAMMER.mp4, S2_GEARS.mp4, S3_CUCKOO.mp4, S4_MIDNIGHT.mp4); it is discarded, as the brief says
- **soft attack**: cue 5.1 cuckoo_call: the brief's -0.05 s offset compensates a soft attack; briefcut places the measured attack on the event frame instead (attack 1 ms after the gated onset in this take)
- **soft attack**: cue 5.2 cuckoo_call: the brief's -0.05 s offset compensates a soft attack; briefcut places the measured attack on the event frame instead (attack 1 ms after the gated onset in this take)
- **loudness**: MIDNIGHT_master_v3.mp4: loudnorm's target was biased +0.20 LU so the export measures -14 LUFS on the EBU R128 meter (loudnorm's internal meter reads this short film differently)
- **loudness**: MIDNIGHT_social_v3.mp4: loudnorm's target was biased +0.30 LU so the export measures -10 LUFS on the EBU R128 meter (loudnorm's internal meter reads this short film differently)
<!-- briefcut:end -->
