# Midnight

The showcase film: 17.75 s, 9:16, four generated clips of a clockmaker's workshop at night, every
sound on its frame, music that stops dead on the midnight strike, one narrator line, an end card.
How it was made, with numbers: the [main README](../../README.md#how-midnight-was-made).

| File | What it is |
|---|---|
| [`BRIEF.md`](BRIEF.md) | the production brief (as `MIDNIGHT_BRIEF.md` in the film folder) |
| [`FLOW_BRIEF.md`](FLOW_BRIEF.md) | the scene prompts pasted into the video tool |
| [`clips/NOTES.md`](clips/NOTES.md) | takes used and rejected, why, known deviations, credits |
| [`sheets/`](sheets/) | the 2 fps sheet of every downloaded take (named by take id) and of each chosen clip |
| [`out/strips/`](out/strips/) | every 8 and 24 fps strip used to pin a frame |
| [`out/cues.md`](out/cues.md) | in/out and every event, with how each frame was found |
| [`OVERRIDES.md`](OVERRIDES.md) | the one decision taken outside the brief (seven taps, not three) |
| [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) | every decision, by the agent and by briefcut |
| [`out/COST.md`](out/COST.md) | the estimate written before any paid call |
| [`out/REPORT.md`](out/REPORT.md), [`out/SUMMARY.md`](out/SUMMARY.md) | QA, edit, events, cues with frame error, mix, decisions |
| [`out/sync_check.jpg`](out/sync_check.jpg) | each sound's frame from the master, with 1/8 s either side |
| [`out/edl_sheet.jpg`](out/edl_sheet.jpg), [`out/preview_sheet.jpg`](out/preview_sheet.jpg), [`out/wide_sheet.jpg`](out/wide_sheet.jpg) | the edit, the preview at 2 fps, the 16:9 export at 1 fps |

The clips, the generated audio and the masters are not in git. The masters
(`MIDNIGHT_master.mp4`, `MIDNIGHT_16x9.mp4`) are attached to the v0.1.0 release.

To re-render from your own copy of the clips and audio cache:

```bash
# film folder: MIDNIGHT_BRIEF.md, OVERRIDES.md, clips/S1..S4, audio/ (cache), out/cues.md
briefcut cut path/to/clockmaker --offline
briefcut regress path/to/clockmaker regress-out   # frame and sample comparison with the master
```
