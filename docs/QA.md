# QA

`briefcut cut` measures the exported master and writes `out/REPORT.md`. A row that fails says FAIL
and stays FAIL; the film is still exported so the owner can see what failed. Code is
`src/core/qa.mjs`, `src/core/cut.mjs` (QA section) and `src/core/report.mjs`.

| Check | How it is measured |
|---|---|
| Duration | video stream duration of the master inside the brief's window, and frame count equal to the EDL total |
| Loudness, true peak, clipping | EBU R128 (`ebur128=peak=true`) on the exported AAC, not the WAV; target ± tolerance, true peak at or under the ceiling; decoded sample peak under -0.1 dBFS with no full-scale samples |
| Every event and cue placed or logged | every audio-map instance is placed or has a drop reason (cut-out region, missing event, after the end) |
| Sync | each sound's position in the master: 200 ms of the premix from its start, located in the master by cross-correlation (±125 ms); error = heard - target in frames, within the brief's tolerance (±1 frame). Effects are placed by their attack point, voices by their gated onset |
| Music hard stop | peak of the music stem after the stop event + fade, scaled by the mastering gain, under -60 dBFS |
| Loudest moment | the maximum of momentary loudness (400 ms) falls on the named hit |
| Hook | the first event's timeline time within the brief's limit |
| First and last frame | mean luma of the first frame above 20 (0-255); with an end card, the last frame is dark with bright text pixels |
| No source audio | one audio stream in the master; the picture is rendered with `-an` and no clip audio is mapped |
| Hard cuts only | the saved render graph (`out/work/render_graph.txt`) holds no speed change, reverse, freeze, loop, zoom, frame interpolation or transition filter |
| Min shot | shortest clip shot against the minimum |
| Cuts on the grid | each cut's distance from the nearest music beat |
| No silence holes | `silencedetect` below the floor for longer than the limit |
| Making-of numbers | takes used and rejected, TTS characters, generations per kind, generations this run, estimated cost, runtime |

What the numbers cannot prove, an agent checks by eye:

- `sync_check.jpg` (from the master): each cue's frame and 1/8 s either side.
- `edl_sheet.jpg`: the middle frame of every shot.
- `preview_sheet.jpg` (2 fps of the 360p preview) and `wide_sheet.jpg` (1 fps of the 16:9 export):
  the film as a viewer gets it, watched before the film is called done.

The report also carries the edit as rendered (listed and rendered in/out, nudges, timeline, cut
vs beat), every event with its timeline time, every cue with picture, target, heard and error,
the mix and master settings, and every decision from the run. `SUMMARY.md` is the same in ten
lines. `cue_times.json` is machine-readable.
