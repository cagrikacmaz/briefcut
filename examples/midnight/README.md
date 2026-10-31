# Midnight

The showcase film: 15.5 s, 9:16, four generated clips of a clockmaker's workshop at night, every
sound on its frame, music that stops dead on the midnight strike, the strike ringing into the end
card, one narrator line. This is version 2: the owner reviewed version 1 and asked for one revision
(ending energy, a tighter cut, a larger end-card line, social loudness), written as
[`FIX01.md`](FIX01.md) and rendered by briefcut. How it was made, with numbers: the
[main README](../../README.md#how-midnight-was-made).

Clips: Google Flow (Veo 3.1 Quality), generated and downloaded by a browser agent (Claude in Chrome) in my own session. Pipeline run: briefcut, driven by a coding agent (Claude Code). Brief, rules, QA criteria and review: me.

| File | What it is |
|---|---|
| [`BRIEF.md`](BRIEF.md) | the production brief (as `MIDNIGHT_BRIEF.md` in the film folder) |
| [`FIX01.md`](FIX01.md) | the revision pass after review (as `MIDNIGHT_FIX01.md`): each section replaces the brief's section of the same name; renders `_v2` |
| [`FLOW_BRIEF.md`](FLOW_BRIEF.md) | the scene prompts pasted into the video tool |
| [`clips/NOTES.md`](clips/NOTES.md) | takes used and rejected, why, known deviations |
| [`sheets/`](sheets/) | the 2 fps sheet of every downloaded take (named by take id) and of each chosen clip |
| [`out/strips/`](out/strips/) | every 8 and 24 fps strip used to pin a frame |
| [`out/cues.md`](out/cues.md) | in/out and every event, with how each frame was found |
| [`OVERRIDES.md`](OVERRIDES.md) | the one decision taken outside the brief (seven taps, not three) |
| [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) | every decision, by the agent (v1 and v2) and by briefcut |
| [`out/COST.md`](out/COST.md) | the estimate written before any paid call (v2 made no new call) |
| [`out/REPORT.md`](out/REPORT.md), [`out/SUMMARY.md`](out/SUMMARY.md) | v2: QA, edit, events, cues with frame error, mix, momentary loudness of the last 5 s, decisions |
| [`out/sync_check.jpg`](out/sync_check.jpg) | each sound's frame from the v2 master, with 1/8 s either side |
| [`out/edl_sheet.jpg`](out/edl_sheet.jpg), [`out/preview_sheet.jpg`](out/preview_sheet.jpg), [`out/wide_sheet.jpg`](out/wide_sheet.jpg) | the edit, the preview at 2 fps, the 16:9 export at 1 fps |
| [`out/v1/`](out/v1/) | version 1 as first delivered: report, summary, cue sheet, sync check |

## Version 1 to version 2

| | v1 | v2 |
|---|---|---|
| Length | 17.750 s | 15.500 s |
| S2 | 1.750-5.250 s (3.5 s, about 2 s static after the gear seats) | 1.042-3.042 s (2.0 s, ends 1.0 s after the gear seats) |
| S4 | 0.000-5.000 s | 0.000-4.500 s (0.42 s after the pull-back stops) |
| End card | 1.75 s, second line 50 px | 1.5 s, second line 104 px |
| Lowest momentary loudness, last 3 s before the card | -42.57 LUFS at 15.9 s (35.15 LU under the strike) | -15.38 LUFS at 12.2 s (7.05 LU under the strike) |
| Narrator | -6 dBFS peak, strike + 1.8 s | -3 dBFS peak, strike + 1.5 s |
| Sounds within ±1 frame | 20 of 20, worst 0.00 | 16 of 16, worst 0.00 |
| Exports | master -14 LUFS, 16:9 | master -14 LUFS, 16:9, social 9:16 and 16:9 at -10 LUFS |

The clips, the generated audio and the masters are not in git. The v2 masters
(`MIDNIGHT_master_v2.mp4`, `MIDNIGHT_social_v2.mp4`, `MIDNIGHT_16x9_social_v2.mp4`) and the v1
masters are attached to the v0.1.0 release.

To re-render from your own copy of the clips and audio cache:

```bash
# film folder: MIDNIGHT_BRIEF.md, MIDNIGHT_FIX01.md, OVERRIDES.md, clips/S1..S4, audio/ (cache), out/cues.md
briefcut cut path/to/clockmaker --offline
briefcut regress path/to/clockmaker regress-out   # frame and sample comparison with the master
```
