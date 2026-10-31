# Cues: MIDNIGHT

Source-clip seconds (frame / 24). Each event: 2 fps sheet estimate -> 8 fps strip -> 24 fps strip
(`out/strips/`), pinned to the first frame that shows the event. Motion values are the per-frame
mean difference from `out/sheets/<clip>.motion.tsv`.

## S1_HAMMER
in: 0.000
out: 3.000
cut: none
The hammer does not tap three times: it taps continuously, every 11-12 frames (about 2 per second),
which the 2 fps sheet aliases (its frames are 12 apart, so every tile shows the same phase). Contact
= the first sharp frame with the hammer head on the gear, right after the blurred descent (a motion
spike followed by a drop). Seven contacts fall inside 0.000-3.000 s.
tap_1: 0.042   (sheet 0.0; 24 fps f1: head on the gear, f0 still descending)
tap_2: 0.542   (sheet 0.5; 24 fps f13: f12 blurred mid-air, f13 on the gear; motion 10.3 -> 2.0)
tap_3: 1.000   (sheet 1.0; 24 fps f24: f23 blurred, f24 on the gear; motion 10.6 -> 3.2)
tap_4: 1.500   (sheet 1.5; f36: motion 10.1 -> 3.1, same shape as f13 and f24)
tap_5: 2.000   (sheet 2.0; 24 fps f48: f47 still blurred above the gear, f48 sharp on it)
tap_6: 2.500   (sheet 2.5; 24 fps f60: f59 blurred, f60 on the gear)
tap_7: 2.958   (sheet 3.0; 24 fps f71: f70 blurred, f71 on the gear, sparks from f71)

## S2_GEARS
in: 1.750
out: 5.250
cut: none
gear_drop: 2.042   (sheet 2.0-2.5; 24 fps f49: the gear drops onto its post, the light on it changes and the balance wheel starts moving on this frame; lower-region motion 0.5 -> 24.1)
No discrete escapement step is visible: after f51 the balance wheel turns continuously, out of focus,
and the motion inside its region stays flat (2-4) with no regular peaks. Closest reading: the regular
pulse the brief asks for (about two steps per second), placed on the music's beats, which are exactly
0.5 s apart (120.00 BPM detected). v2 (FIX01) plays S2 from 1.042 to 3.042 (timeline 3.0-5.0 s): the
gear seats on the beat at timeline 4.0 s and the only beat after it inside the shot is 4.5 s.
(v1 played S2 from 1.750 and had six steps at 2.250-4.750; that sheet is kept in out/v1/cues.md.)
step_1: not found, closest 2.542   (f61, beat at timeline 4.5 s)

## S3_CUCKOO
in: 0.375
out: 4.875
cut: none
No door is visible: the bird flies in from the right edge (first pixels f10-f11) and lands on the dial.
bird_1: 0.583   (sheet ~0.5; 24 fps f14: first frame the bird is over the dial; f11-f13 it is beside the clock)
bird_2: 1.750   (sheet 1.5-2.0; 24 fps f42: first frame fully leaning out, beak forward, f40-f41 still turning; it leans out again at f81-f84, silent)
fly_off: 4.625  (sheet ~4.5; 24 fps f111: first frame of the take-off blur; f114 the bird is gone)

## S4_MIDNIGHT
in: 0.000
out: 5.000
cut: none
The hands never meet at XII (minute at XII, hour near V). The strike lands on the hard cut to the dial.
midnight: start   (first frame of S4 in the edit)
pullback: 1.000   (sheet ~1.4; 24 fps f24: the dial starts to shrink on this frame; motion 0.4 -> 1.0 -> 1.8)
pullback_end: 4.083   (the pull-back eases out; f98 is the first frame whose motion falls below a third of its peak, 16.8 at f59 -> 5.6; on the sheet 4.0-5.0 s show the same framing. FIX01 ends S4 0.5 s later, 4.583)
