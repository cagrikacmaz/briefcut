# Playbook: generating clips in a web video tool with a browser agent

For video tools that have no API (Google Flow and similar). The agent works in a real browser, in
the user's own logged-in account, while the user can watch and stop it. briefcut ships no code
that automates the tool: this page is instructions for an agent the user supervises, used at the
user's discretion and under the tool's terms. Do not use private endpoints, do not handle CAPTCHAs
or bot checks (stop and ask the user to do it), do not copy cookies or browser profiles, do not
sign in for the user.

This is how the Midnight takes were made (see `examples/midnight/clips/NOTES.md`).

## Before you start

1. `briefcut prompts <film>` writes `<film>/flow_brief.md`: one prompt per scene, shared style
   already appended, aspect ratio, length, takes per scene, the one video model.
2. Confirm the user is signed in to the tool in this browser and has the credits the run needs
   (scenes x takes x the model's cost per clip; write the estimate in `OPEN_QUESTIONS.md`).
3. Note the time: downloads are found later by modification time.

## Generate

1. Open a new project in the tool. Name it after the film or leave the default; write the name in
   `clips/NOTES.md`.
2. Set, once, for the whole project: aspect ratio from the brief (9:16 or 16:9), the brief's video
   model at the quality it names (one model for every scene), clip length (8 s), takes per prompt
   (2 is a good default: one usable take per scene is common, two takes make it likely).
3. For each scene, in order: paste the prompt exactly as written in `flow_brief.md`, submit. Do not
   rewrite prompts; if a prompt is refused, record the refusal and the tool's message, then stop that
   scene and continue with the others.
4. Submit all scenes before waiting; generation runs in parallel.
5. Wait for every take to finish. Check the tool's queue rather than reloading repeatedly.

## Download

1. Open each finished take and download the 1080p version (the upscale, if the tool offers one).
   Never take the preview or the 720p file when 1080p exists: an upscale later is a loss you cannot
   undo. If a take will not download, retry once, then record it as missing.
2. Keep the tool's file names; they carry the take id that `clips/NOTES.md` refers to.
3. When all downloads are done:

   ```
   briefcut ingest <film> --from ~/Downloads --since 30m --match "*.mp4"
   ```

   This copies the takes into `clips/_takes/`, skips byte-identical duplicates, and writes
   `clips/_takes/INGEST.md` with size, frame rate, frame count and colour tags per take. Any take
   not at the film's size or rate is flagged; it is never upscaled or retimed here.

## Choose takes

Follow `playbooks/take-selection.md`: `briefcut sheets <film> --takes`, look at every sheet,
copy the chosen take per scene to `clips/<SCENE>.mp4`, move the rest to `clips/_rejected/`, and
write `clips/NOTES.md`:

```
| Scene | Used | Rejected | Why |
|---|---|---|---|
| S1_HAMMER | 42512b8a | b6822952 | used: hits from frame 0, clear dust on the taps; rejected: softer taps, hands leave frame |
```

Then a "Known deviations" paragraph (what the takes do that the prompts did not ask for) and the
credits spent.

## Record

In `clips/NOTES.md`: the tool, the model and settings, the project name, the date, takes
generated, downloaded, missing, used, rejected, and the credits spent. These numbers go into the
film's README and the report's making-of row.
