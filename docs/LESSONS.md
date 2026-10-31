# Lessons from production

Every rule in briefcut exists because a real film broke without it. This file lists the failure
modes my production runs hit (a kids' learning channel: shorts, long-form shows, song films, and
client films), what caused each one, the rule I wrote to prevent it, and the check that now
catches it. Where briefcut implements the check, the file is named.

Format of every entry: **Symptom** (what was seen or heard), **Cause**, **Rule**, **Check**.

Contents: [Audio generation](#audio-generation) · [Voice timing](#voice-timing) ·
[Music and songs](#music-and-songs) · [Mix and loudness](#mix-and-loudness) ·
[Edit and cuts](#edit-and-cuts) · [Picture and colour](#picture-and-colour) ·
[Sync and events](#sync-and-events) · [Takes and clip generation](#takes-and-clip-generation) ·
[Agent workflow and handover](#agent-workflow-and-handover) · [Cost and cache](#cost-and-cache) ·
[QA and export](#qa-and-export) · [On-screen safety](#on-screen-safety) ·
[Defaults that came out of this](#defaults-that-came-out-of-this)

---

## Audio generation

### 1. Generated audio starts late by its own leading silence
- **Symptom:** voices and effects landed 0.1-0.6 s after the frame they were placed on. One kiss effect started with 0.65 s of breath and held several kisses.
- **Cause:** TTS and SFX files carry silence, breath or room tone before the sound. Placing the file start on the event frame places the sound late by that amount.
- **Rule:** "placed" means the sound's onset, never the file start. Voices and soft sounds are gated (10 ms RMS, -32 dB under the loudest window) and the onset is placed on the cue time. Hits are trimmed so the main transient sits 3 ms into the file. A file holding several hits keeps only the first or loudest.
- **Check:** the cue table reports Picture, Placed and their difference. The mock audio provider puts 0.3 s of silence in front of every sound so the trim is exercised in every test run (`src/core/assets.mjs` `trimOnset`, `trimTransient`; `test/trim.test.mjs`).

### 2. Tag-only lines are refused by the TTS model
- **Symptom:** the v3 TTS model refused a line made only of an audio tag (`[giggles]`, `[laughs]`).
- **Cause:** the model will not render input with no speakable text.
- **Rule:** add a short vocalization after the tag (`[giggles] Hehehe!`). The brief keeps the original text; the report shows what was sent.
- **Check:** logged as a decision on every run (`src/core/assets.mjs` `speakableText`).

### 3. A non-English name is mispronounced
- **Symptom:** TTS said a child character's name wrong in every take.
- **Cause:** the model guesses pronunciation from spelling.
- **Rule:** a respelling map applied to the text sent to TTS only: whole words, case-insensitive, tags untouched. Briefs, reports and subtitles keep the real spelling. Changing an entry regenerates only the lines that contain the word; the old take is kept.
- **Check:** an audition step renders one line with several respellings for the owner to choose; the report marks lines that used the map (`applyPronunciations`).

### 4. The music model sings a name wrong
- **Symptom:** a name came out as other names or as unrelated words, five times in each of two otherwise clean takes.
- **Cause:** sung lyrics are respelled by the music model independently of TTS.
- **Rule:** a separate respelling list for lyrics. Every take is transcribed; the name must be heard as a name. A misheard name weighs 3 in take scoring, and every timestamp where it is sung is listed for the owner to listen to.
- **Check:** SONG_REVIEW.md with timestamps and per-take scores.

### 5. Speech-to-text cannot judge vowel quality
- **Symptom:** a made-up toddler word was transcribed as a real English word in every take, including a control take that really said the real word.
- **Cause:** speech-to-text snaps to dictionary words.
- **Rule:** measure the first vowel's formants instead of trusting the transcript (the intended open vowel sat at F1 about 1300-1470 Hz against 1120-1190 Hz for the real word), prefer takes that end level, and list "listen at" timestamps.
- **Check:** a listening note in the character check, not an automated pass.

### 6. The automatic take picker chose the wrong words
- **Symptom:** "length closest to the median of the takes" picked takes that said similar-sounding wrong words.
- **Cause:** length says nothing about content.
- **Rule:** transcribe every take, then pin the verified take per line (`Take: cue N <file>`). A pinned take is never regenerated; if it runs over its cap it is kept whole and logged.
- **Check:** TAKES.md lists every take with score and length and marks the one used.

### 7. Statements that sound like questions
- **Symptom:** non-question lines rose 3.3-3.6 semitones at the end.
- **Cause:** expressive TTS settings plus "?" in the text.
- **Rule:** only the voices allowed to ask questions keep "?"; any other line is sent with "!". A take whose ending rises more than 2 semitones gets one retake, and the lower ending wins.
- **Check:** a QA row re-measures the end pitch of every non-question line (`src/core/pitch.mjs`).

### 8. A voice named in the brief does not exist, or voice design fails
- **Symptom:** the named voice was missing from the account; voice design returned 422 (preview text under 100 characters) and 403 (description refused by moderation).
- **Cause:** account state differs from the brief; API minimums.
- **Rule:** the brief lists candidates in order ("first that exists"); the pipeline logs which one it used. A designed voice is made once from the brief's description, saved under its name, with preview text of 105-120 characters. A missing voice never stops the run silently: the fallback is flagged at the top of REPORT.md.
- **Check:** "voices" decision in OPEN_QUESTIONS.md and the report header (`src/providers/audio/elevenlabs.mjs` `resolveVoice`).

### 9. An impact sound disappears on phones
- **Symptom:** 95% of a sting's energy was under 150 Hz.
- **Cause:** the SFX model rendered a sub-bass hit; phone speakers do not reproduce it.
- **Rule:** generate several takes and pick the one with the most 150-400 Hz energy; high-pass at 60 Hz; drop sub-only layers that only use limiter headroom.
- **Check:** a QA row asserts the intended hit is the loudest moment by momentary loudness (400 ms window) (`src/core/qa.mjs`).

### 10. The audio API goes away mid-production
- **Symptom:** `401 payment_required`, a network allowlist blocking the API, requests that hung with no answer, a missing forced-alignment permission.
- **Cause:** account, network and permission state outside the pipeline.
- **Rule:** every request has a hard timeout (60 s; music 240 s) covering the whole body and two retries with backoff. `--offline` runs from the cache only; word timings fall back to the RMS gate. A blocked run renders a clearly named draft, never a "master", plus HANDOFF.md with the one command to finish.
- **Check:** `--offline` fails loudly on the first uncached asset (`src/core/assets.mjs` `AssetCache`).

## Voice timing

### 11. Caps measured from the file start
- **Symptom:** laughs before the first word ran 0.6-1.5 s, so lines landed late and overlapped the next one.
- **Cause:** caps and placement counted from the start of the file.
- **Rule:** caps count from the voice onset after the gate. A non-lead line's non-verbal lead-in is cut to 0.4 s (overridable per line).
- **Check:** the cue table shows lead-in trims; clap and hit transients are cross-correlated against the premix after mastering (`src/core/voices.mjs`).

### 12. Long pauses inside one line
- **Symptom:** a 1.04 s gap inside a two-word line.
- **Cause:** the TTS model paused between words.
- **Rule:** a silence over 0.5 s between two words of one line is cut to 0.3 s (cut in the middle of the silence, 10 ms fades), using forced alignment.
- **Check:** each shortened pause is noted on its cue row.

### 13. The lead voice overlaps itself
- **Symptom:** two consecutive lead lines ran into each other.
- **Cause:** both were timed to picture with no spacing rule.
- **Rule:** lead lines keep their picture moment and wait only for their own previous line plus 0.15 s, at most 0.3 s. Past that the earlier line is cut at its last word boundary that fits (forced alignment), after first trying a retake that fits whole.
- **Check:** a "lead cut" decision names any removed word.

### 14. Different speakers talk over each other
- **Symptom:** about 4.5 s of one short had two voices at once; the worst overlap was 1.37 s.
- **Cause:** every line was placed on its own mouth frame with no overlap control.
- **Rule:** lines of different speakers overlap at most 0.15 s. The later line waits up to 0.3 s (longer only up to a pinned "mouth still open" frame); the earlier line's tail after its last word is trimmed; a non-lead line that still collides is cut in the gap before the colliding word; anything left is lowered and fails QA.
- **Check:** QA row "Voice overlaps".

### 15. Gain steps inside a line
- **Symptom:** the owner heard the other voices and the music "thin out and drop" whenever the child spoke.
- **Cause:** -4 dB was applied only to the overlapping part of a line.
- **Rule:** never change gain partway through a line. An overlapping line sits lower as a whole (one constant gain).
- **Check:** QA row "No gain step inside any line"; a voice-bus plot per scene.

### 16. Caps cutting words
- **Symptom:** a cap ended a line in the gap before the word that crossed it, so words were lost.
- **Cause:** the cap truncated the take.
- **Rule:** a cap never cuts a word. Up to three more takes are made and the shortest natural one that fits is used; if none fits, the line runs long untruncated and is logged. Per-line overrides live in the brief or OVERRIDES.md (for example 3.0 s for a sneeze).
- **Check:** "cap" decisions name the take used and its length.

### 17. A gap rule broke lip-sync
- **Symptom:** answers landed 0.6-1.6 s after the mouths opened.
- **Cause:** a "question end + 1.0 s" participation gap pushed answers later than the picture.
- **Rule:** lip-sync beats any spacing rule. An answer is never delayed past its mouth frame; a shorter gap is logged.
- **Check:** a gap table in the report.

### 18. A character answered before hearing its name
- **Symptom:** the child answered before the lead finished saying the child's name.
- **Cause:** the answer was placed on a wave, not after the name.
- **Rule:** a non-verbal sound goes on the wave; the word starts on the first mouth-open frame after the name ends (forced alignment) plus 0.10 s.
- **Check:** cue sheet pins with both events.

### 19. Lines collide with songs and group calls
- **Symptom:** a lead-in line collided with a group call; end-anchored lines ran into songs or were faded 1 s early.
- **Cause:** lines anchored to the end of a scene had no room rule.
- **Rule:** a line that would run into a closed audio block starts earlier; if there is still no room it is dropped, never faded mid-word. A later pass regenerates compromised lines and places them whole.
- **Check:** dropped and repaired lines are listed in the summary. For a single line at the end of a scene briefcut does the same: start earlier down to a floor, else extend the shot if frames are left, else let it run over the next shot (`fitLineToScene` in `src/core/voices.mjs`).

### 20. Support lines lost their words
- **Symptom:** giggles were cut before "Hehehe!" because the lead spoke next.
- **Cause:** overlap control cut the non-lead line.
- **Rule:** a repaired non-lead line keeps its words and sits 4 dB under the lead.
- **Check:** `keepWords` noted on the cue row.

### 21. Flanging between two similar voices
- **Symptom:** a comb-filter, flanger-like sound.
- **Cause:** two similar voices said the same word 0.15 s apart.
- **Rule:** never put the same word on two voices that close together; the second line starts at least 0.35 s after the first line's last word ends.
- **Check:** forced alignment of both lines.

### 22. A shared line masked the main voice
- **Symptom:** with the second voice at -4 dB, the main voice was clearly on top in only 45% of its words.
- **Cause:** -4 dB is enough for a reaction, not for two voices saying the same text.
- **Rule:** a "together" flag exempts the pair from overlap control and sets the second voice lower (a sweep picked -8 dB).
- **Check:** word-window level comparison logged with the choice.

### 23. A confirmation on top of the answer
- **Symptom:** the lead said "Yes!" while the child was still answering.
- **Rule:** the confirmation waits until the answer has ended.
- **Check:** overlap QA.

### 24. Group calls pushed into the limiter
- **Symptom:** layered group calls lost their attack.
- **Rule:** three takes with aligned onsets, each at -4 dB, summed; they do not key the music duck; the limiter may take at most 3 dB off them.
- **Check:** QA row "group calls: limiter ≤ 3 dB".

## Music and songs

### 25. Stitched vocal generations
- **Symptom:** joining separately generated vocal takes produced audible jumps in voice, key and room.
- **Cause:** every generation is a different performance.
- **Rule:** a song is one production from one composition plan, archived once and reused. A song block plays that production sample for sample; at most one join, a 10 ms crossfade on a bar line, and it is flagged.
- **Check:** song-block bit-identity in the premix (see 34).

### 26. Long songs drift
- **Symptom:** every take of an 8-verse song sang the first 3-4 verses right, then repeated an earlier verse.
- **Cause:** music models lose the plan over long structures; plans with more than 30 sections are refused.
- **Rule:** check every verse's content with speech-to-text and rank takes by verses sung correctly; if no take works, a second production covers the rest.
- **Check:** the song log lists every take and its problems.

### 27. Unplanned hook shouts
- **Symptom:** all first takes shouted the hook word in the middle of the song, a false stop cue in a stop game.
- **Rule:** the plan states the hook appears once, as the last word; the check counts hook words; failing takes A and B trigger one retry round C and D.
- **Check:** SONG_REVIEW.md hook count per take.

### 28. Intros and endings ignore the plan
- **Symptom:** planned 2-bar intros ran 3-6 bars; music played on up to 8 s after the final word.
- **Rule:** bars are measured on each take and the edit adapts to any intro; the song is cut at the hard stop with a 30 ms fade; takes with a late vocal or a long run-on are rejected.
- **Check:** per-take timing table.

### 29. Downbeat detected on the wrong beat
- **Symptom:** block cuts missed the real bar lines by a quarter bar.
- **Cause:** the onset detector picked the strongest accent, not beat one.
- **Rule:** move the downbeat to the beat where the sung lines start.
- **Check:** block cuts against song bar lines in QA (`src/core/beats.mjs`).

### 30. Leading silence, pickups and silent tails in music
- **Symptom:** songs started with up to 0.5 s of near-silence (one with a silent 2 s bar); sung pickups started before the bar line; files ended with 1.5 s below -70 dBFS.
- **Rule:** blocks start on the first downbeat or note; joins move to just before a pickup's first word; a block ends where the music ends.
- **Check:** block edges reported in samples.

### 31. Which point of a word to sync to
- **Symptom:** the onset of a shouted word and the end of its held vowel are 0.3-0.5 s apart.
- **Rule:** use character-level alignment for the onset, and log which point each film syncs to.
- **Check:** a lyric-sync table, ±2 frames.

### 32. Music tempo and loops
- **Symptom:** a bed ordered at 112 BPM came back at 120; loop seams risked clicks.
- **Cause:** the music model does not honour the requested tempo exactly.
- **Rule:** always use the detected tempo and freeze the beat grid in a file next to the music. Off-tempo: one retake, then a pitch-preserving conform. Loops are cut to whole bars with a one-beat equal-power crossfade. When several takes are made, pick by measurement (steadiest tempo, beat clarity), not by ear alone.
- **Check:** detected BPM and grid contrast in the report; `tempoSteadiness` in `src/core/beats.mjs`.

## Mix and loudness

### 33. Silence holes at boundaries
- **Symptom:** digital-silence holes of 0.3-0.6 s at song boundaries; a song that faded out over 2.5 s.
- **Rule:** the music before a block runs to the block's first downbeat; a block ends on its last chord and the chord rings out under the next scene while the bed returns. No digital silence anywhere.
- **Check:** QA "nothing below -45 dBFS for more than 0.15 s" (shorts: -50 dBFS for 1.5 s) (`src/core/qa.mjs`).

### 34. "Bit-identical" meant different things
- **Symptom:** a song block passed one reading of the rule and failed another.
- **Rule:** the premix over a block equals the decoded song sample for sample with nothing else in it; the master over a block is the song times one gain (residual under -40 dB); 20 ms edge fades allowed; an AAC export is not tested for bit identity.
- **Check:** `checkSongBlock` in `src/core/qa.mjs`, `test/songblock.test.mjs`.

### 35. Songs too quiet next to speech
- **Symptom:** song blocks spread 6.6 LU and sat under the speech.
- **Rule:** one static gain per block puts songs about 2 dB over speech, all within ±1 LU; the song audio itself is never altered; dialogue gets one shared gain.
- **Check:** LEVELS.md before/after tables.

### 36. True peak goes over after AAC encoding
- **Symptom:** the limited WAV passed; the AAC export measured up to +1.2 dB over the ceiling on bright transients.
- **Cause:** AAC encoding reconstructs peaks above the PCM ceiling.
- **Rule:** measure loudness and true peak on the exported file, never the WAV. If the export fails, lower the limiter ceiling in steps (-1.5, -2.0, -2.5, -3.0 dBTP) and encode again. The limiter runs 4x oversampled with latency compensation, then a two-pass linear loudnorm.
- **Check:** QA loudness row measured on the master (`src/core/master.mjs`).

### 37. The limiter crushed a peaky passage
- **Symptom:** the limiter took 2.5-3.7 dB off claps on 5-8% of samples.
- **Rule:** a block whose peaks would sit more than 1.5 dB over the ceiling is set up to 0.6 dB lower; per-block peak reduction is reported.
- **Check:** limiter reduction in the report.

### 38. A quiet opening
- **Symptom:** the cold open sat about 8 LU under the rest of the film.
- **Rule:** the opening is matched to within 0.5 LU of the first 30 s of the film.
- **Check:** QA "step into the film ≤ 2 LU".

### 39. The music pumped between words
- **Symptom:** a per-line duck (80 ms in, 300 ms out) made the bed pump.
- **Rule:** the duck is keyed from the summed voice bus (10 ms RMS over -40 dBFS): attack 120 ms, hold 200 ms, release 450 ms, at most 6 dB. SFX and group calls do not key it.
- **Check:** `keyedDuck` in `src/core/mix.mjs`.

### 40. A loud hit buried the voices
- **Symptom:** an impact effect at the voice peak made the line after it hard to hear.
- **Rule:** effects sit on their own bus 3-6 dB under the voice peak unless the brief names one hit as the loudest moment; a hit and a line never start together (the line waits for the hit's first 1.5 s when the brief says so).
- **Check:** per-bus peak levels in the report; the protected window is a decision row (`protect` in `src/core/brief.mjs`).

### 41. Silent jumps and repeated effects
- **Symptom:** jumps in the picture had no sound; when they did, the same file on every jump sounded mechanical.
- **Rule:** effects come in variants (4 for jumps) rotated so neighbouring hits differ; hits closer than 0.15 s share one sound; none inside song blocks.
- **Check:** the cue table names the variant used on every hit (`src/core/sfx.mjs` `assignVariants`).

## Edit and cuts

### 42. Beat snap broke the minimum shot
- **Symptom:** at 112-116 BPM a beat is 12-13 frames, so ±3 frames often cannot reach one; snapping shortened shots under the minimum.
- **Rule:** snapping never takes a shot below the minimum shot (2.5 s on the channel); a shot already shorter is kept and fails QA; a cue frame never leaves its shot. If a cut stays off the beat, the distance is reported, not forced.
- **Check:** QA rows "Min shot" and "Cuts on beat" (`snapCutsToBeats` in `src/core/edl.mjs`, `test/edl.test.mjs`).

### 43. Matched cuts undone by snapping
- **Symptom:** snapping moved cuts away from matched frame pairs.
- **Rule:** `Beat snap: fixed` keeps the cuts where the cue sheet puts them and still reports their distance from the grid.
- **Check:** "Cuts off the beat grid" row.

### 44. Abrupt pose jumps between generated clips
- **Symptom:** the picture jumped from one clip's last pose to the next clip's first.
- **Rule:** hard cuts stay the default. A film may opt in to a matched-cut search (smallest frame difference in the last 1.5 s out and first 1.0 s in) with short dissolves centred on the cut, so the timeline and cue times do not change.
- **Check:** TRANSITIONS.md per cut.

### 45. Held frames
- **Symptom:** the picture froze 5-6 times for 1-2 s.
- **Cause:** holds used to fill time after a stop and at the end.
- **Rule:** never hold a frame. In and out points avoid still stretches; the film ends on movement or on a designed card.
- **Check:** motion QA on the master: frame-difference brightness under 1.3 for more than 0.5 s fails.

### 46. Repeated footage
- **Symptom:** 0.7 s of waving repeated six times to fill an ending.
- **Rule:** never loop, repeat, freeze, slow down, speed up or reverse footage unless the brief says so. The last clip plays once.
- **Check:** the render graph is inspected: only trim, scale, colour and concat filters (QA row "Hard cuts only").

### 47. Loop seams and rushed shots
- **Symptom:** a loop cut into itself; shots changed before the action read.
- **Rule:** story shots start before the action and run to its result plus about 0.7 s, never cutting mid-action; a loop clip is never used twice in a row.
- **Check:** "cut smoothness" row and the EDL sheet.

### 48. Picture and sound lengths differ
- **Symptom:** the picture ended before the sound.
- **Rule:** the timeline length is set by the picture; a line that runs past the end is logged and handled by the fit rule.
- **Check:** QA "picture = sound length" and frame count equals the EDL total.

## Picture and colour

### 49. Generated clips differ in colour
- **Symptom:** one shot was about 15% duller than its neighbours.
- **Cause:** each generation picks its own exposure and saturation.
- **Rule:** optional shot colour match before the grade: a linear luma map onto the reference's 2nd/99th percentiles (gain ×0.9-1.15) and a chroma gain onto its 99th percentile (×0.85-1.3), from a 120 px proxy at 4 fps.
- **Check:** QA "every shot within ±4 levels and ±6%" and grade_check.jpg (`Shot match: on` in a brief).

### 50. The "most colourful shot" was a bad reference
- **Symptom:** a bright prop made one shot the reference; white scenes hit the clamp and skin went orange.
- **Rule:** use a content-neutral reference (`Shot match reference: S2`) or match luma only.
- **Check:** grade_check.jpg reviewed by the owner.

### 51. The grade over-warmed a warm set
- **Symptom:** a warm set went orange under the channel grade.
- **Cause:** saturation, not colour balance.
- **Rule:** measure before changing the grade; escalate to the owner rather than tune per shot.
- **Check:** wall RGB ratios in grade_check.

### 52. Mixed colour tags and frame rates
- **Symptom:** generated sources carried mixed matrix, primaries and transfer tags; an intro ran at 23.976 fps.
- **Rule:** every clip is converted to BT.709 limited range and tagged, and every encode carries explicit tags; a clip at another size or rate is conformed and logged, never retimed by speed change.
- **Check:** probe of the export; a "conformed" decision for each clip (`src/core/video.mjs`).

### 53. Upscaled previews used where originals existed
- **Symptom:** 37 clips came from a 720p preview download and were upscaled.
- **Cause:** the download step took the first file offered.
- **Rule:** always download the 1080p (or native) file; match downloads to clips by content, not name; never upscale when a native file exists; log any clip left at lower resolution. An agent must not invent upscales or frame-rate changes the brief did not ask for.
- **Check:** `briefcut ingest` probes every take and reports size and frame rate (`src/core/ingest.mjs`).

### 54. Branding edge cases
- **Symptom:** a watermark just over a width threshold, a colour key that erased a white character, a watermark unreadable on a cream wall.
- **Rule:** fixed placement and size rules, never on the intro; inside the safe area on vertical video with a soft shadow.
- **Check:** watermark check sheet.

## Sync and events

### 55. Cues off by frames from coarse sheets
- **Symptom:** voices landed 0.6-1.6 s late when events were read from 2 fps sheets only.
- **Cause:** a 2 fps sheet has 12 frames between images.
- **Rule:** estimate on a 2 fps, 180 px sheet; refine on an 8 fps strip (±0.75 s, 240 px); settle doubtful frames at 24 fps; pin each verified frame. Speech on the first mouth-open frame, hits on first contact, calls on the gesture peak.
- **Check:** sync_check.jpg shows each placed frame with 1/8 s before and after, and the agent iterates until every frame matches (`src/core/strips.mjs`, `src/core/sync-check.mjs`).

### 56. Late cues only visible on the master
- **Symptom:** a re-check on the rendered master found 7 cues 3-6 frames late.
- **Cause:** the premix and source frames agreed, the render did not (offsets, snapped cuts).
- **Rule:** check sync from the master, not the premix; fix anything over the tolerance and re-render.
- **Check:** briefcut measures every hit's onset in the master audio by cross-correlation and reports the frame error per cue; sync_check.jpg is cut from the master (`src/core/qa.mjs`).

### 57. The event never happens on screen
- **Symptom:** a mouth never visibly opens; a door the brief describes is not in the take; clock hands never meet.
- **Rule:** write `not found`, place the cue on the closest visible moment that reads the same, log it and flag it at the top of the report. A cue sheet drafted from motion alone is flagged as a draft.
- **Check:** "Events not found" block on top of REPORT.md.

## Takes and clip generation

### 58. Character glitches in generated clips
- **Symptom:** horns grew from a gesture, a tail appeared, ears stretched, hair vanished, shoes appeared on a barefoot character, an animal morphed into another character, a film-sprocket overlay appeared mid-take.
- **Cause:** video models drift from the reference over 8 s.
- **Rule:** check every take against the model sheet at 2 fps, re-check each flag at 8 fps. A glitch under 0.5-1 s with no cue in it is trimmed; anything else is flagged for regeneration with the prompt changed. Never hide a glitch with speed, zoom or freeze.
- **Check:** take sheets plus `clips/NOTES.md` (used, rejected, why).

### 59. Takes, file names and frame counts
- **Symptom:** downloads arrived with preview names, timestamps or `(1)` copies; byte-identical duplicates; clips of 190-191 frames when the brief said 192.
- **Rule:** map files by name prefix, else by modification time plus a verification strip; set MD5 duplicates aside; always use real frame counts and clamp out points.
- **Check:** `briefcut ingest` writes `clips/_takes/INGEST.md` with size, frames, fps and hash per take.

## Agent workflow and handover

### 60. A master was overwritten
- **Symptom:** a correction pass exported as version 1 and the first master was lost.
- **Rule:** never overwrite an earlier master; each pass writes `_v2`, `_v3`; the previous master is copied aside before any export.
- **Check:** the export step refuses to overwrite a master unless it is the same version (`src/core/cut.mjs`).

### 61. Two agents edited shared code at once
- **Symptom:** a later rule change re-mixed an approved film; a regression stopped being bit-identical.
- **Rule:** extend with new files while another run is active; record the hash of every pipeline file; a regression run re-renders a film in a mirror folder and compares frame hashes, decoded samples, loudness and the report tables.
- **Check:** `briefcut regress` writes REGRESSION.md (`src/core/regress.mjs`).

### 62. Inputs that do not match the brief
- **Symptom:** a correction arrived only as a chat message; two brief copies differed; clips were missing.
- **Rule:** write every correction down as a FIX file; the brief wins; if clips are missing, render nothing rather than a correctly named master built from fallback footage; every decision goes into OPEN_QUESTIONS.md; HANDOFF.md says how to resume.
- **Check:** a missing clip is a hard error naming the file.

### 63. A model invents changes nobody asked for
- **Symptom:** an agent "improved" footage with an upscale, a frame-rate change or a speed ramp, or regenerated audio that was already approved.
- **Cause:** an unattended agent filling gaps with plausible work.
- **Rule:** the brief is the single source of truth; anything it does not ask for is not done; every assumption is written down with its reason; approved audio is pinned in the cache.
- **Check:** the render graph check, the cache index and OPEN_QUESTIONS.md.

## Cost and cache

### 64. Paying twice for the same audio
- **Symptom:** rule changes and re-runs regenerated takes that already existed.
- **Rule:** every generation is cached under a deterministic name with the fingerprint of its request; the same request is never sent twice; a changed request writes a new version and keeps the old file. All audio is generated before the edit, and the edit runs offline.
- **Check:** `briefcut estimate` writes out/COST.md before any paid call; `--max-spend` refuses a run that would exceed it; `--offline` fails on the first missing asset.

## QA and export

### 65. Checks added after misses
Each of these became a QA row after a film shipped without it:
- duration window (a short film is logged, not padded);
- first and last frames not black (mean luma), or the last frame is the designed end card;
- hard cuts only, proved from the render's filter graph;
- the clips' own audio streams discarded;
- no content-credential boxes left in the master;
- chapters shifted by the intro length, first chapter at 0:00;
- a log that claimed an asset was regenerated when it was reused was corrected: logs state what happened, not what was planned.

## On-screen safety

### 66. Unsafe behaviour on screen
- **Symptom:** a clip showed a child biting an unpeeled banana.
- **Rule:** nothing on screen may model unsafe or wrong behaviour. Offending frames are not used (removed with a lossless cut when possible) and the decision is logged; the whole scene is checked at 8 fps.
- **Check:** a per-film safety note in the character check.

## Endings and delivery loudness

### 67. The film went quiet before its end card
- **Symptom:** after the last big hit the momentary loudness fell 35 LU in 4.5 s; the seconds before the end card sounded empty on a phone.
- **Cause:** a generated bell take decays about 10 dB per second, the line after it was short, and the room tone sat 25 dB lower.
- **Rule:** hold a ringing take's own decay (it may fall no faster than a set rate, with the lift capped) rather than adding new sounds; duck the held tail under the voice so the line stays clear; keep the room tone to the last frame.
- **Check:** a QA row "the last N s before the end card stay within X LU of the hit", from the master's momentary loudness, and the momentary values of the last 5 s in the report.

### 68. A printed true peak hid an overshoot
- **Symptom:** the meter printed -1.0 dBTP, which passed, but the decoded export peaked at -0.97 dBFS.
- **Cause:** the EBU R128 summary prints true peak to 0.1 dB; the true peak is never below the sample peak.
- **Rule:** the true-peak rule also counts the sample peak of the decoded export.
- **Check:** the loudness rows print both values; the mastering loop steps the limiter ceiling down until both are under the target.

### 69. A loud master for social platforms overshot after encoding
- **Symptom:** at -10 LUFS, a -3 dBTP limiter ceiling read -1.0 dBTP after AAC encoding, and -3.5 and -4 dBTP read about +1 dBTP.
- **Cause:** hard limiting leaves dense peaks that the AAC encoder overshoots by 2 dB or more, and not in step with the ceiling.
- **Rule:** master each loudness target separately from the same premix, step the ceiling down as far as -5 dBTP, and measure the exported file, never the WAV.
- **Check:** one QA row per export with integrated loudness, true peak, sample peak, the ceiling used and the loudnorm mode.

### 70. A held bell buried the line after it
- **Symptom:** the narrator sounded thin and quiet on a phone; measured in the speech band (300-3000 Hz), the line sat 1 dB under the bell.
- **Cause:** the bell's tail was held near its peak for the ending, and a broadband duck took it down by the same amount at every frequency, while a phone reproduces almost nothing but the speech band. The line's second half was also 10-20 dB under its first word.
- **Rule:** duck the effect deeper in the speech band only, with a fast attack and release so the band clears under the first word and returns when the line ends; compress the voice so its end is as present as its start; key the duck on the line, not on its breath tail.
- **Check:** a QA row with the line's speech-band level over the effect's, from the stems, in the line's window (threshold 6 dB), next to the ending-energy row, since the two pull against each other.

---

## Defaults that came out of this

The channel preset (`src/presets/kids-channel.json`) carries the values below; `default.json`
is neutral and keeps only the loudness, sync and export rules.

| Area | Default |
|---|---|
| TTS (channel) | v3 model, stability 0.35, similarity 0.85, style 0.2, speaker boost on, never "Robust" |
| Voice caps (channel) | non-lead non-verbal 1.2 s, non-lead with words 1.5 s, lead single word 0.8 s, from the onset after a -32 dB gate |
| Voice spacing | lead +0.15 s after its previous line, at most 0.3 s delay; other speakers overlap at most 0.15 s |
| Lead-in / pauses (channel) | lead-in 0.4 s; inner pauses over 0.5 s cut to 0.3 s |
| Questions (channel) | only the lead asks; endings rising over 2 semitones get one retake |
| Sync | 2 fps 180 px sheets, 8 fps strips ±0.75 s 240 px, 24 fps for doubtful frames, master check ±1-2 frames |
| Edit | min shot 2.5 s (channel) / 2.0 s (default), dead time cut only past 1.5-2.0 s and only uncovered, beat snap ±3 frames |
| Mix | voices -6 dBFS peak, effects -8 to -9 dBFS peak, music -21 to -22 dBFS RMS, keyed duck 4 dB (max 6), 120/200/450 ms |
| Song blocks | 20 ms edge fades, 10 ms joins, 30 ms fade at a hard stop |
| Loudness | two-pass linear loudnorm to -14 LUFS ±0.5, -1 dBTP, LRA 11, limiter 4x oversampled, measured on the export |
| Holes | nothing below -45 dBFS for more than 0.15 s (long-form); -50 dBFS for 1.5 s (shorts) |
| Colour (channel) | grade `eq=saturation=1.35:contrast=1.06:brightness=0.01,colorbalance=rs=0.04:bs=-0.04:rm=0.03:bm=-0.03,unsharp=5:5:0.4`; shot match clamps luma ×0.9-1.15, chroma ×0.85-1.3; BT.709 limited on every export |
| API | timeouts 60 s (music 240 s), 2 retries with backoff |
| Export | 24 fps, H.264 CRF 18, AAC 192k 48 kHz, 360p preview |
