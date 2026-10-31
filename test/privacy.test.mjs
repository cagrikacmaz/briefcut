// Privacy gate: no names from the private productions this pipeline came from, no local paths,
// nothing that looks like an API key, anywhere in the repository. Runs on every test run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'briefcut-demo']);
const TEXT = /\.(mjs|js|json|md|txt|yml|yaml|example|gitignore)$|^[^.]+$/i;

// Stored reversed so this file does not itself contain the names it forbids.
const NAMES = ['obmap', 'aryak', 'har-iak', 'har-eyk', 'har-ee-hak', 'aryk', 'imay'].map((s) => s.split('').reverse().join(''));
const KEYS = [
  // The prefix is assembled so a history scan for key material does not match this line.
  { name: 'ElevenLabs key', re: new RegExp(`\\b${'s'}k_[a-f0-9]{24,}`, 'i') },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{30,}/ },
  { name: 'fal key', re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{24,}\b/i },
  { name: 'assigned secret', re: /\b(?:api[_-]?key|secret|token)\s*[=:]\s*['"]?[A-Za-z0-9_\-]{24,}/i },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
];
const PATHS = [/[A-Za-z]:[\\/]+Users[\\/]/i, /\/home\/[a-z]+\/(?!runner\b)/i, /AppData[\\/]/i, /AssetsMovie/i];

function files(dir, out = []) {
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
