# Providers

One video model per film, set once in the brief (`Video model:`); a scene that names another
model is refused when the brief is parsed. Audio comes from one audio provider per film
(`Audio provider:`, default `elevenlabs`).

Endpoints were checked against each vendor's official documentation on 2026-10-31. "Contract
tested" means every request briefcut sends is checked (URL, method, headers, body) and every
documented response shape is parsed, against recorded responses in `test/fixtures/recorded.json`,
with no network (`test/providers.test.mjs`). "Live" means a real film was produced through it.

| Provider | Kind | What it does in briefcut | Billing | Status |
|---|---|---|---|---|
| `elevenlabs` | audio | TTS, sound effects, music, forced alignment, speech-to-text, voice design | prepaid plan (credits / USD) | **live** (Midnight) + contract tested |
| `local` | audio | your own files in `<film>/audio/local/` | free | contract tested (interface) |
| `mock` | audio | deterministic tones with 0.3 s leading silence | free | used by the demo and the golden test |
| `handoff` | video | writes `flow_brief.md` for a web tool without an API (Google Flow and similar); `briefcut ingest` takes the downloads | the tool's own credits | **live** (Midnight, with a browser agent) |
| `higgsfield` | video | one key for Seedance, Kling, Wan, Hailuo and more | prepaid USD, per successful job | contract tested |
| `gemini-omni` | video | Gemini API video (`gemini-omni-1.1-flash`) | pay as you go | contract tested |
| `fal` | video | fal.ai queue, default Seedance 2.0 text-to-video | prepaid USD, per second | contract tested |
| `mock` | video | ffmpeg test pattern with white flashes on known frames | free | used by the demo and the golden test |

Keys come from the environment or the film folder's `.env`, `.env.txt` or `.env.local` (then the
same files one folder up). They are never printed, logged, written to a report or put in an
error message (`src/core/env.mjs`). Names: `ELEVENLABS_API_KEY`, `HIGGSFIELD_API_KEY`
(`KEY_ID:KEY_SECRET`, or `HF_API_KEY` + `HF_API_SECRET`), `GEMINI_API_KEY` (or `GOOGLE_API_KEY`),
`FAL_KEY`.

## Cost before spending

`briefcut estimate <dir>` lists every request the film needs, marks what the cache already holds
and writes `out/COST.md`. `prepare` and `run` run the same estimate first and refuse to send
anything when `--max-spend <usd>` would be exceeded; the cache also stops mid-run if the running
total would pass it. `generate` checks the video estimate the same way before submitting.

## ElevenLabs (`src/providers/audio/elevenlabs.mjs`)

| Call | Endpoint | Notes |
|---|---|---|
| voices | `GET /v2/voices` (paged, `page_size=100`) | voice chosen by name: the first candidate the brief lists that exists, exact name or name prefix (`George` matches `George - Warm, ...`) |
| TTS | `POST /v1/text-to-speech/{voice_id}` | `model_id`, `voice_settings` (stability, similarity_boost, style, use_speaker_boost, speed 0.7-1.2 inside `voice_settings`); `eleven_v3` takes neither speed nor speaker boost, so they are dropped for it; `output_format=mp3_44100_192`, falling back to the default format on plans without it |
| sound effects | `POST /v1/sound-generation` | `text`, `duration_seconds` clamped to 0.5-30, `prompt_influence`, `loop` for ambience, `model_id: eleven_text_to_sound_v2` |
| music | `POST /v1/music` | `prompt`, `music_length_ms` (3-600 s), `force_instrumental`, `model_id: music_v1`; paid plans only |
| forced alignment | `POST /v1/forced-alignment` (multipart `file`, `text`) | word timings for caps, word-boundary cuts and pause trims; cached as `<take>.align.json` |
| speech-to-text | `POST /v1/speech-to-text` (`model_id: scribe_v2`) | lyric and take checks (`scribe_v1` is deprecated) |
| voice design | `POST /v1/text-to-voice/design`, `POST /v1/text-to-voice` | preview text must be 100-1000 characters |
| usage | `GET /v1/user/subscription` | `character_count`, `character_limit` |

Every request has a hard timeout over the whole response (music 240 s, else 60 s); network
errors and timeouts are retried twice (2 s, 4 s), 429 and 5xx up to four times.

Pricing used by the estimator (pricing pages, 2026-10-31): multilingual v2 1 credit per character;
sound effects 40 credits per second with a duration (200 per generation without); music 900
credits per minute; about 0.0002 USD per credit on the smallest paid plan, so estimates err high.
The API price page also quotes 0.08 USD per 1,000 TTS characters for v2, v3 and v4. Not
published: forced alignment and voice design prices (estimated as 0). `eleven_v4` is the current
flagship TTS model; `eleven_v3` and `eleven_multilingual_v2` remain available.

## Higgsfield (`src/providers/video/higgsfield.mjs`)

Base `https://api.higgsfield.ai`, header `Authorization: Key <KEY_ID>:<KEY_SECRET>`.
`POST /{endpoint}` with an `Idempotency-Key` header returns `{ request_id, status_url }`; poll the
returned `status_url` (statuses `queued`, `in_progress`, `completed`, `failed`, `nsfw`,
`canceled`); the result is `video.url` (kept 7 days). `POST /estimate/{endpoint}` returns
`{ usd }` and is what `estimate` and `--max-spend` use. Failed and nsfw jobs are refunded.

Model names in the brief map to endpoints: `seedance-2.0` ->
`bytedance/seedance-2.0/text-to-video` (duration 4-15 s, resolution up to 1080p, aspect ratio,
`generate_audio: false`), `kling-3.0-pro` / `kling-3.0-std` -> `kling-video/v3.0/<tier>/text-to-video`.
Any other name is used as an endpoint path as written.

Not supported or not documented: no Veo model is listed in Higgsfield's API docs today; there is
no balance endpoint (use the console). Webhooks (`?hf_webhook=`) are not used; briefcut polls
with backoff and keeps job state in `out/jobs.json`.

## Gemini API video (`src/providers/video/gemini-omni.mjs`)

The Veo 3.1 preview model IDs on the Gemini API were shut down on 2026-10-22; Google's replacement
there is `gemini-omni-1.1-flash` on the Interactions API (Veo itself moved to Google's enterprise
platform). A brief that still names a `veo-3.1-*-preview` model gets `gemini-omni-1.1-flash`, and
the substitution is logged.

`POST /v1beta/interactions` with header `x-goog-api-key`, body `{ model, input, response_format:
{ type: "video", aspect_ratio, resolution, delivery: "uri" }, background: true }`; poll
`GET /v1beta/interactions/{id}`; the video is the `video` content of a `model_output` step,
downloaded from `/v1beta/files/{id}:download?alt=media` once the file is `ACTIVE`. About 0.10 USD
per second of 720p video.

Not documented, so not relied on: a duration parameter and a base clip length for this model,
and whether background mode is supported for it (if the create call returns the finished
interaction, briefcut uses it directly).

## fal (`src/providers/video/fal.mjs`)

`POST https://queue.fal.run/{model}` with `Authorization: Key <FAL_KEY>` returns `{ request_id,
status_url, response_url }`. Status `IN_QUEUE`, `IN_PROGRESS`, `COMPLETED`; a failed job also ends
`COMPLETED` with an `error` field, which briefcut treats as a failure. The returned URLs are used
as given (status and result live under owner/app, not the full model path). Default model
`bytedance/seedance-2.0/text-to-video`: `duration` is a string (`"4"` to `"15"`), resolution
480p or 720p in the API (a 1080p request is sent as 720p and logged), about 0.30 USD per second at
720p.

## Handoff (`src/providers/video/handoff.mjs`)

For video tools without an API. `briefcut prompts` (or `generate` with `handoff`) writes
`flow_brief.md`; you, or a browser agent you supervise in your own logged-in session, generate
and download the takes; `briefcut ingest <dir> --from ~/Downloads --since 30m` copies them into
`clips/_takes/` and probes them. The procedure an agent follows is
[`playbooks/flow-browser-agent.md`](../playbooks/flow-browser-agent.md). briefcut contains no code
that automates a consumer web app: no browser scripts, no private endpoints, no CAPTCHA handling,
no cookie or profile copying.
