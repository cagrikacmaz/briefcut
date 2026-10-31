// API keys: the environment first, then the film folder's .env / .env.txt / .env.local, then the
// same files one folder up (a project folder holding several films). A key's value is returned
// to the caller only; it is never printed, logged, written to a report or put in an error.
import fs from 'node:fs';
import path from 'node:path';

const FILES = ['.env', '.env.txt', '.env.local'];

export function keyFiles(filmDir) {
  const dirs = [filmDir, path.dirname(filmDir)];
  return dirs.flatMap((d) => FILES.map((f) => path.join(d, f))).filter((f) => fs.existsSync(f));
}

export function readKey(name, filmDir, { required = true } = {}) {
  if (process.env[name]) return { value: process.env[name], source: 'environment' };
  for (const file of filmDir ? keyFiles(filmDir) : []) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)\\s*$`));
      if (m && m[1].trim()) return { value: m[1].replace(/^['"]|['"]$/g, '').trim(), source: path.basename(file) + (path.dirname(file) === filmDir ? '' : ' (parent folder)') };
    }
  }
  if (required) throw new Error(`${name} not found in the environment or in ${FILES.join(' / ')} next to the film`);
  return null;
}

// For error messages: never echo anything that could be a key.
export function scrub(s) {
  return String(s).replace(/(key[=: ]+)[A-Za-z0-9_\-:.]{8,}/gi, '$1[redacted]').replace(/[A-Za-z0-9_\-]{32,}/g, '[redacted]');
}
