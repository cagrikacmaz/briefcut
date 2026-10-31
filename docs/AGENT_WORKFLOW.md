# Agent workflow

The human writes the brief and the rules and reviews the QA. Agents execute: they write scene
prompts, drive the video tool, choose takes, find events and verify sync. Deterministic code does
everything that can be computed. This page is the order of work; [`AGENTS.md`](../AGENTS.md) is
the operating manual an agent reads first, and `playbooks/` has the detailed procedures.

```
brief.md
  -> scene prompts (flow_brief.md)            agent writes from the brief            briefcut prompts
  -> generate clips                            API provider, or a browser agent      briefcut generate | playbooks/flow-browser-agent.md
  -> download 1080p + move into clips/         browser agent, or ingest              briefcut ingest --from <Downloads> --since 30m
  -> contact sheets, pick takes                agent looks at 2 fps sheets           briefcut sheets --takes | playbooks/take-selection.md
  -> find events, pin frames                   agent: sheet -> 8 fps -> 24 fps       briefcut strip | playbooks/event-detection.md
  -> voices, music, SFX, ambience              audio provider, cached                briefcut estimate, briefcut prepare
  -> cut, mix, master, export                  deterministic code                    briefcut cut
  -> sync_check.jpg + QA REPORT.md             agent verifies every cue, iterates    (back to out/cues.md, then cut again)
```

## State lives in files

Work can stop and resume with another agent, because everything is on disk:

| File | Written by | Holds |
|---|---|---|
| `BRIEF.md`, `<ID>_FIXnn.md` | human | the film |
| `OVERRIDES.md` | agent | decisions outside the brief, flagged in the report |
| `flow_brief.md` | `prompts` | scene prompts |
| `out/jobs.json` | `generate` | video jobs, resumable |
| `clips/_takes/INGEST.md` | `ingest` | every take probed |
| `clips/NOTES.md` | agent | used / rejected / why / known deviations |
| `out/sheets/`, `out/strips/` | `sheets`, `strip` | what the agent looked at |
| `out/cues.md` | agent | in/out and every event, with how it was found |
| `audio/index.json` | `prepare` | every generation and its request fingerprint |
| `audio/music_pick.json` | `cut` | the music take and its frozen beat grid |
| `out/COST.md` | `estimate` | cost before spending |
| `out/REPORT.md`, `SUMMARY.md`, `sync_check.jpg` | `cut` | QA |
| `OPEN_QUESTIONS.md` | agent and `cut` | every decision with its reason |
| `HANDOFF.md` | agent | what is done, what is next, the exact command |

## Unattended

- Never ask the owner. Choose the most reasonable option, write it and its reason in
  `OPEN_QUESTIONS.md` (or `HANDOFF.md`), continue.
- A failing step is fixed and retried once; if it fails again it is logged and skipped.
- Spend only what `estimate` showed. Never regenerate cached audio without a reason in the log.
- Never overwrite an earlier master.

## Iterating on sync

1. `briefcut cut <dir>` (add `--offline` once audio is prepared: nothing can be regenerated).
2. Open `out/sync_check.jpg`. For each row: does the middle frame show the moment, and do the
   ±1/8 s frames not show it yet / any more?
3. Where a row is wrong, make a 24 fps strip around it (`briefcut strip <dir> S3 1.75 --fps 24`),
   fix the time in `out/cues.md` (or pin `cue <row>: <s>`), run `cut` again.
4. Stop when every row matches and the Sync row passes. Then look at `preview_sheet.jpg` and
   `wide_sheet.jpg` before calling the film done.
