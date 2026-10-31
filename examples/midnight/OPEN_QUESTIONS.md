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

<!-- briefcut:start -->
## Decided by briefcut

- **override**: audio map row 1 (sfx:hammer_tap) plays at tap_* instead of tap_1, tap_2, tap_3: the chosen take shows seven hammer contacts in S1, not three; the brief's goal is that every sound on screen lands on its frame, so every contact gets a hammer_tap instead of leaving four visible taps silent (OVERRIDES.md)
- **clip audio**: 4 source clip(s) carry an audio stream (S1_HAMMER.mp4, S2_GEARS.mp4, S3_CUCKOO.mp4, S4_MIDNIGHT.mp4); it is discarded, as the brief says
- **soft attack**: cue 5.1 cuckoo_call: the brief's -0.05 s offset compensates a soft attack; briefcut places the measured attack on the event frame instead (attack 1 ms after the gated onset in this take)
- **soft attack**: cue 5.2 cuckoo_call: the brief's -0.05 s offset compensates a soft attack; briefcut places the measured attack on the event frame instead (attack 1 ms after the gated onset in this take)
<!-- briefcut:end -->
