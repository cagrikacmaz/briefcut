# Playbook: finding events and pinning frames

Goal: `out/cues.md` with every event the brief's "Event detection" table names, each pinned to the
first frame that shows it, and the in/out of every shot. Sound will be placed exactly on these
frames, so one frame off shows.

## 1. Estimate on the 2 fps sheet

`briefcut sheets <film>` writes `out/sheets/<CLIP>.jpg` and `<CLIP>.motion.tsv`. For each event,
note the tile where it seems to happen. Read the motion column too: a hit is a spike followed by a
drop (fast movement, then contact and stillness); a camera move is a ramp; a take-off is a spike
after a still stretch.

## 2. Refine at 8 fps

`briefcut strip <film> S1 0.75 "taps" --fps 8` shows every third frame over ±0.75 s around the
estimate. Find the two frames the event falls between.

## 3. Settle at 24 fps

`briefcut strip <film> S1 0.54 "tap 2" --fps 24` shows nine consecutive frames. Pick the frame by
the brief's rule:

- a hit or contact: the first sharp frame with contact; the frame before is usually motion-blurred
  in the air;
- speech: the first frame the mouth visibly opens;
- a call or gesture: its peak (beak furthest out, hand highest);
- an appearance: the first frame the thing is where the brief says (Midnight's bird_1 is the first
  frame the bird is over the dial, not its first pixels at the frame edge);
- a departure: the first frame of the movement away (the take-off blur);
- a cut event: `start` (the shot's first frame in the edit).

## 4. Write out/cues.md

```
## S1_HAMMER
in: 0.000
out: 3.000
cut: none
tap_2: 0.542   (sheet 0.5; 24 fps f13: f12 blurred mid-air, f13 on the gear; motion 10.3 -> 2.0)
```

Seconds = frame / fps, three decimals. Write how you found each frame after the value: the next
agent (or the owner) can check it. Choose in/out for the brief's shot lengths, keep every event
inside its shot, and remember the cut itself can move up to ±3 frames toward the music grid.

If an event never happens on screen, write `not found, closest <seconds>` with the closest moment
that reads the same and say why. If the take shows more events than the brief lists (seven hammer
taps where the brief says three), every visible one should get its sound: name them all, and record
the audio-map change in `OVERRIDES.md` with the reason.

## 5. Verify on the master

After `briefcut cut`, open `out/sync_check.jpg`. Every row is the frame under the sound's start
with 1/8 s before and after, taken from the rendered master. The middle frame must show the
moment; the left frame must not show it yet. Fix and re-run until every row matches.
