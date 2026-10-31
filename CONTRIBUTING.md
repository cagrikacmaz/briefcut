# Contributing

Thanks for looking. briefcut is small on purpose: Node.js 22, ESM, no runtime dependencies,
ffmpeg for media. Please keep it that way.

- **Run the tests** before a pull request: `npm test` (offline, mock providers, about a minute).
- **Every rule has a reason.** A change to an edit, voice, sync or mix rule should say which failure
  it prevents; add it to [docs/LESSONS.md](docs/LESSONS.md) as symptom, cause, rule, check.
- **New providers** implement the interface in `src/providers/video/index.mjs` or
  `src/providers/audio/index.mjs`, read the vendor's current documentation (link it in
  [docs/PROVIDERS.md](docs/PROVIDERS.md) with the date you checked), and come with contract tests
  against recorded responses in `test/fixtures/recorded.json`. No network in tests.
- **No consumer web-app automation.** Browser work belongs in playbooks for an agent the user
  supervises, not in code.
- **No keys anywhere.** The privacy test (`test/privacy.test.mjs`) fails on anything that looks like
  a key, a local path, or a name from private productions.
- **Determinism.** The same inputs must give the same master; `briefcut regress` checks it.
- Style: match the surrounding code; comments say why, not what.
