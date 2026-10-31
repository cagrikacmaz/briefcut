import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SR = 48000;
export const CH = 2;

export const db = (x) => 20 * Math.log10(Math.max(Math.abs(x), 1e-12));
export const undb = (d) => Math.pow(10, d / 20);
export const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
export const t3 = (s) => (s == null || Number.isNaN(s) ? '-' : Number(s).toFixed(3));
export const f2 = (s) => (s == null || Number.isNaN(s) ? '-' : Number(s).toFixed(2));
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function readJson(p, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

// Forward slashes for paths written into reports, so they read the same on every OS.
export const posix = (p) => String(p).replace(/\\/g, '/');

// Run log. `assume` entries are the decisions taken instead of asking: they go to
// OPEN_QUESTIONS.md and the report. `quiet` keeps the console clean in tests.
export class Log {
  constructor(file, { quiet = false } = {}) {
    this.file = file;
    this.quiet = quiet;
    this.assumptions = [];
    this.warnings = [];
    if (file) {
      ensureDir(path.dirname(file));
      fs.writeFileSync(file, `briefcut run ${new Date().toISOString()}\n`);
    }
  }
  write(level, msg) {
    const line = `[${level}] ${msg}`;
    if (!this.quiet) console.log(line);
    if (this.file) fs.appendFileSync(this.file, line + '\n');
  }
  info(msg) {
    this.write('info', msg);
  }
  warn(msg) {
    this.warnings.push(msg);
    this.write('warn', msg);
  }
  assume(topic, msg) {
    if (!this.assumptions.some((a) => a.topic === topic && a.msg === msg)) this.assumptions.push({ topic, msg });
    this.write('decide', `${topic}: ${msg}`);
  }
}

export const nullLog = () => new Log(null, { quiet: true });

// Glob with * and ? only (enough for take file names and event wildcards).
export function globToRegExp(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${esc}$`, 'i');
}

// "30m", "2h", "45s", "1d" -> milliseconds.
export function parseDuration(s) {
  const m = String(s).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i);
  if (!m) throw new Error(`cannot read duration "${s}" (use 30m, 2h, 45s)`);
  const mult = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[(m[2] || 's').toLowerCase()];
  return Number(m[1]) * mult;
}
