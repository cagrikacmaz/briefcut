# AGENTS.md: operating manual for coding and browser agents

Read this fully before running briefcut on a film. It is agent-neutral: any coding agent with a
shell, and for the handoff path a browser agent in a real browser.

## What you are doing

The owner wrote a brief (`BRIEF.md` or `<ID>_BRIEF.md`) and the rules. You produce the film it
describes, unattended, and leave a QA report the owner reviews. Deterministic code does the
editing, mixing and mastering; you do what code cannot: drive a video tool when there is no API,
look at pictures, choose takes, find events, and verify sync.

## The job, in order

1. Read the brief, every `<ID>_FIXnn.md` in order (a FIX overrides the brief only where it says
   so), `OVERRIDES.md`, `OPEN_QUESTIONS.md`, `clips/NOTES.md` and `out/REPORT.md` if they exist.
   Earlier decisions stand unless a newer file changes them. Check `out/` for work already done
   and resume from it.
2. Clips: `briefcut generate <film>` for an API provider, or the handoff path
   (`briefcut prompts`, then `playbooks/flow-browser-agent.md`, then `briefcut ingest`).
3. Takes: `playbooks/take-selection.md`. Write `clips/NOTES.md`.
4. Events: `playbooks/event-detection.md`. Write `out/cues.md`.
5. Cost: `briefcut estimate <film>`; read `out/COST.md`.
6. Audio: `briefcut prepare <film> --max-spend <usd>`.
7. Edit: `briefcut cut <film> --offline`. Look at `out/sync_check.jpg`; fix pins and re-run until
   every row shows its moment. Look at `out/preview_sheet.jpg` and `out/wide_sheet.jpg`.
8. Finish with the brief's summary (or `out/SUMMARY.md`) and leave `HANDOFF.md` if you stop early.

## Unattended (always)

- Never ask the owner a question, never wait for confirmation. When you would ask, choose the most
  reasonable option and write the decision and its reason in `OPEN_QUESTIONS.md`.
- A failing step: fix and retry once; if it fails again, log it, skip it, continue.
- Never overwrite an earlier master: a FIX file makes the next export `_v2`.
- Do not change briefcut's source while another agent may be running a film.

## Looking at pictures

- Only small images: contact sheets (`briefcut sheets`), strips (`briefcut strip ... --fps 8|24`),
  `sync_check.jpg`, `edl_sheet.jpg`, the preview and 16:9 sheets. Never open full-resolution frames
  one by one; never send yourself whole videos.
- A 2 fps sheet aliases anything periodic near 2 per second. Read the motion profile
  (`out/sheets/<clip>.motion.tsv`) alongside it.
- Write in `out/cues.md` how you found each frame. The owner and the next agent must be able to
  check you.
- When the picture does not contain what the brief describes, say so: `not found`, closest moment,
  reason. Never pretend.

## Rules you must not break

- The brief is the single source of truth. Do not upscale, change frame rates, retime, speed up,
  slow down, freeze, reverse, loop or zoom footage unless the brief says so.
- Nothing on screen may model unsafe or wrong behaviour; if a clip shows it, do not use those
  frames and log it.
- QA can say FAIL. Leave the FAIL in the report and explain it; do not tune checks to pass.

## Secrets and cost

- Keys live in the environment or the film's `.env` / `.env.txt` / `.env.local`. Never print, log,
  echo, copy or commit a key. Never write one into a report, a commit or a chat message.
- Paid generations are cached in `audio/index.json`; the same request is never sent twice. Run
  `estimate` before any paid call and pass `--max-spend`. Regenerate only when a rule requires it,
  and log why.

## Handover

All state is in files (see `docs/AGENT_WORKFLOW.md`). When you stop early, write `HANDOFF.md`: what
is done, what is next, and the exact command to continue.

## Browser agents

Use the user's own, already signed-in browser session, while the user can watch. Never sign in for
the user, never handle a CAPTCHA or bot check (stop and ask the user), never use private endpoints
or copy cookies or profiles. briefcut contains no code that automates a web app; the playbook is
instructions for you.

## Paths

Quote every path. Paths with non-ASCII characters work and must keep working. On Windows the key
file may be hidden as `.env.txt`.
