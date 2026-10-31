# Security

## Keys

briefcut reads API keys from the environment or from `.env`, `.env.txt` or `.env.local` next to
a film (or one folder up). Keys are only sent to their own vendor's API in the documented header.
They are never printed, logged, written into reports, cached requests or error messages
(`src/core/env.mjs`, `scrub`). `.gitignore` ignores every `.env*` file except `.env.example`, and
`test/privacy.test.mjs` fails if anything that looks like a key is in the repository.

If you think a key could leak through briefcut (a log line, a report, an error), please report it
privately: open a GitHub security advisory on the repository, or contact the maintainer through
the email on their GitHub profile. Do not open a public issue with key material in it.

## Spending

Every paid call goes through the asset cache, which never sends the same request twice, and
through `--max-spend`, which refuses a run whose estimate exceeds it. Report any path that spends
money without an estimate.

## Browser agents

briefcut contains no code that drives a web app, signs in, solves CAPTCHAs or copies cookies or
browser profiles. The handoff playbook is instructions for an agent working in the user's own,
supervised browser session.
