// Privacy gate: no names from the private productions this pipeline came from, no local paths,
// nothing that looks like an API key, anywhere in the repository. Runs on every test run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'briefcut-demo']);
const TEXT = /\.(mjs|js|json|md|txt|yml|yaml|example|gitignore)$|^[^.]+$/i;

// Stored reversed so this file does not itself contain the names it forbids.
const rev = (s) => s.split('').reverse().join('');
const NAMES = ['obmap', 'aryak', 'har-iak', 'har-eyk', 'har-ee-hak', 'aryk', 'imay'].map(rev);
// Assistant and model brands: the repository credits no tool for authorship. Provider names that
// are part of the pipeline (Google Flow, Veo, ElevenLabs, Higgsfield, the Gemini API, fal) are
// integrations and stay allowed; the brand of an agent is not.
const BRANDS = [
  new RegExp(`\\b${rev('edualc')}\\b`, 'i'),
  new RegExp(`\\b${rev('ciporhtna')}\\b`, 'i'),
  new RegExp(`\\b${rev('supo')}\\b`, 'i'),
  new RegExp(`\\b${rev('tennos')}\\b`, 'i'),
  new RegExp(`\\b(?:tahc)?${rev('tpg')}(?:\\b|-?\\d)`.replace('tahc', rev('tahc')), 'i'),
  new RegExp(`\\b${rev('xedoc')}\\b`, 'i'),
  new RegExp(rev('ytivargitna'), 'i'),
  new RegExp(`\\b${rev('inimeg')}\\s+(?:in|cli|code|agent)\\b`, 'i'),
];
// The one allowed occurrence: the credits line at the end of the Midnight example's intro.
const CREDITS_FILE = 'examples/midnight/README.md';
const CREDITS = `Clips: Google Flow (Veo 3.1 Quality), generated and downloaded by a browser agent (${rev('emorhC ni edualC')}) in my own session. Pipeline run: briefcut, driven by a coding agent (${rev('edoC edualC')}). Brief, rules, QA criteria and review: me.`;
const KEYS = [
  // The prefix is assembled so a history scan for key material does not match this line.
  { name: 'ElevenLabs key', re: new RegExp(`\\b${'s'}k_[a-f0-9]{24,}`, 'i') },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{30,}/ },
  { name: 'fal key', re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{24,}\b/i },
  { name: 'assigned secret', re: /\b(?:api[_-]?key|secret|token)\s*[=:]\s*['"]?[A-Za-z0-9_\-]{24,}/i },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
];
const PATHS = [/[A-Za-z]:[\\/]+Users[\\/]/i, /\/home\/[a-z]+\/(?!runner\b)/i, /AppData[\\/]/i, /AssetsMovie/i];

// Everything git would commit (tracked plus untracked, minus ignored files such as a local
// HANDOFF.md); a plain walk when git is not available.
function files(dir, out = []) {
  if (dir === ROOT) {
    const r = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8' });
    if (r.status === 0) return r.stdout.split('\0').filter((f) => f && TEXT.test(path.basename(f)) && fs.existsSync(path.join(ROOT, f))).map((f) => path.join(ROOT, f));
  }
  for (const f of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(f)) continue;
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) files(p, out);
    else if (TEXT.test(f) && st.size < 2e6) out.push(p);
  }
  return out;
}

test('no private names, local paths or key-like strings in the repository', () => {
  const hits = [];
  for (const f of files(ROOT)) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const text = fs.readFileSync(f, 'utf8');
    for (const n of NAMES) if (new RegExp(n.replace(/-/g, '[- ]?'), 'i').test(text)) hits.push(`${rel}: a private name`);
    for (const k of KEYS) if (k.re.test(text)) hits.push(`${rel}: ${k.name}`);
    if (rel !== 'test/privacy.test.mjs') for (const p of PATHS) if (p.test(text)) hits.push(`${rel}: a local path (${p})`);
  }
  assert.deepEqual(hits, []);
});

test('no assistant or model brand anywhere, except the one credits line', () => {
  const hits = [];
  let credited = 0;
  for (const f of files(ROOT)) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    let text = fs.readFileSync(f, 'utf8');
    if (rel === CREDITS_FILE) {
      const lines = text.split(/\r?\n/);
      credited = lines.filter((l) => l === CREDITS).length;
      text = lines.filter((l) => l !== CREDITS).join('\n');
    }
    text.split(/\r?\n/).forEach((line, i) => {
      for (const re of BRANDS) if (re.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(hits, []);
  assert.equal(credited, 1, `the credits line appears exactly once, as its own line, in ${CREDITS_FILE}`);
});

test('only .env.example is allowed among env files', () => {
  const envs = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      if (SKIP_DIRS.has(f)) continue;
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/^\.env/i.test(f) && f !== '.env.example') envs.push(path.relative(ROOT, p));
    }
  };
  walk(ROOT);
  assert.deepEqual(envs, []);
});

// Images and videos carry metadata: generator text chunks, EXIF, C2PA provenance manifests.
test('no brand or provenance metadata in images and videos', () => {
  const MEDIA = /\.(png|jpe?g|gif|webp|tiff?|mp4|mov)$/i;
  const r = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8' });
  const list = r.status === 0 ? r.stdout.split('\0').filter((f) => MEDIA.test(f) && fs.existsSync(path.join(ROOT, f))) : [];
  const hits = [];
  for (const rel of list) {
    // Metadata is readable text; compressed picture data matches short words by chance.
    const text = (fs.readFileSync(path.join(ROOT, rel)).toString('latin1').match(/[\x20-\x7e]{8,}/g) || []).join('\n');
    if (/c2pa|jumbf/i.test(text)) hits.push(`${rel}: provenance manifest`);
    for (const re of BRANDS) if (re.test(text)) hits.push(`${rel}: ${re}`);
  }
  assert.deepEqual(hits, []);
});
