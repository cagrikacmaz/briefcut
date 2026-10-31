# Midnight

The showcase film: 15.5 s, 9:16, four generated clips of a clockmaker's workshop at night, every
sound on its frame, music that stops dead on the midnight strike, the strike ringing into the end
card, one narrator line. This is version 3. The owner reviewed version 1 and asked for a revision
(ending energy, a tighter cut, a larger end-card line, social loudness), written as
[`FIX01.md`](FIX01.md); then reviewed version 2 and asked for a deeper, clearer narrator, written as
[`FIX02.md`](FIX02.md). briefcut rendered each. How it was made, with numbers: the
[main README](../../README.md#how-midnight-was-made).

Clips: Google Flow (Veo 3.1 Quality), generated and downloaded by a browser agent (Claude in Chrome) in my own session. Pipeline run: briefcut, driven by a coding agent (Claude Code). Brief, rules, QA criteria and review: me.

| File | What it is |
|---|---|
| [`BRIEF.md`](BRIEF.md) | the production brief (as `MIDNIGHT_BRIEF.md` in the film folder) |
| [`FIX01.md`](FIX01.md), [`FIX02.md`](FIX02.md) | the revision passes after review (as `MIDNIGHT_FIX01.md`, `MIDNIGHT_FIX02.md`): each section replaces the brief's section of the same name; they render `_v2` and `_v3` |
| [`FLOW_BRIEF.md`](FLOW_BRIEF.md) | the scene prompts pasted into the video tool |
| [`clips/NOTES.md`](clips/NOTES.md) | takes used and rejected, why, known deviations |
| [`sheets/`](sheets/) | the 2 fps sheet of every downloaded take (named by take id) and of each chosen clip |
| [`out/strips/`](out/strips/) | every 8 and 24 fps strip used to pin a frame |
| [`out/cues.md`](out/cues.md) | in/out and every event, with how each frame was found |
| [`OVERRIDES.md`](OVERRIDES.md) | the one decision taken outside the brief (seven taps, not three) |
| [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) | every decision, by the agent (v1, v2, v3) and by briefcut |
| [`out/AUDITION.md`](out/AUDITION.md) | the v3 narrator audition: four voices, fundamental and spectral centroid |
| [`out/COST.md`](out/COST.md) | the estimate written before the v3 paid calls (4 audition lines, about 0.01 USD) |
| [`out/REPORT.md`](out/REPORT.md), [`out/SUMMARY.md`](out/SUMMARY.md) | v3: QA, edit, events, cues with frame error, mix, momentary loudness of the last 5 s, decisions |
| [`out/sync_check.jpg`](out/sync_check.jpg) | each sound's frame from the master, with 1/8 s either side (unchanged since v2) |
| [`out/edl_sheet.jpg`](out/edl_sheet.jpg), [`out/preview_sheet.jpg`](out/preview_sheet.jpg), [`out/wide_sheet.jpg`](out/wide_sheet.jpg) | the edit, the preview at 2 fps, the 16:9 export at 1 fps |
| [`out/v1/`](out/v1/), [`out/v2/`](out/v2/) | the earlier versions as delivered: reports, summaries, v1 cue sheet and sync check |

## Version by version

| | v1 | v2 | v3 |
|---|---|---|---|
| Length | 17.750 s | 15.500 s | 15.500 s (picture as v2) |
| S2 | 1.750-5.250 s (3.5 s) | 1.042-3.042 s (2.0 s) | as v2 |
| S4 | 0.000-5.000 s | 0.000-4.500 s | as v2 |
| End card | 1.75 s, second line 50 px | 1.5 s, second line 104 px | as v2 |
| Narrator voice | George | George | Adam (audition: lowest fundamental 90.1 Hz and centroid 1424 Hz of four) |
| Narrator level | -6 dBFS peak, strike + 1.8 s | -3 dBFS peak, strike + 1.5 s | -3 dBFS peak after a +2 dB low shelf at 150 Hz and a 6:1 compressor, strike + 1.5 s |
| Strike under the line | not ducked | 4 dB | 6 dB (150 ms attack, 600 ms release), 18 dB more in 300-3000 Hz |
| Line over the strike, 300-3000 Hz | - | - | +6.44 dB |
| Lowest momentary loudness, last 3 s before the card | -42.57 LUFS (35.15 LU under the strike) | -15.38 LUFS (7.05 LU under) | -16.09 LUFS (7.15 LU under) |
| Sounds within ±1 frame | 20 of 20, worst 0.00 | 16 of 16, worst 0.00 | 16 of 16, worst 0.00 |
| Exports | master -14 LUFS, 16:9 | + social 9:16 and 16:9 at -10 LUFS | as v2 |

The clips, the generated audio and the masters are not in git. The v3 masters
(`MIDNIGHT_master_v3.mp4`, `MIDNIGHT_social_v3.mp4`, `MIDNIGHT_16x9_social_v3.mp4`) and the v2 and
v1 masters are attached to the v0.1.0 release.

To re-render from your own copy of the clips and audio cache:

```bash
# film folder: MIDNIGHT_BRIEF.md, MIDNIGHT_FIX01.md, MIDNIGHT_FIX02.md, OVERRIDES.md, clips/S1..S4, audio/ (cache), out/cues.md
briefcut cut path/to/clockmaker --offline
briefcut regress path/to/clockmaker regress-out   # frame and sample comparison with the master
```
