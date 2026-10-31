// Mock audio: deterministic tones, no network, no key. Every sound starts after 0.3 s of silence,
// like real generated audio often does, so the onset and transient trims are exercised by every
// test and every demo run.
import { SR, CH } from '../../core/util.mjs';

export const MOCK_LEAD = 0.3;

export function wavBuffer(pcm, sr = SR, ch = CH) {
  const n = pcm.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(ch, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * ch * 2, 28);
  b.writeUInt16LE(ch * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(pcm[i] * 32767))), 44 + i * 2);
  return b;
}

// Small deterministic hash -> [0, 1).
function hash01(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

// Word timings the mock TTS produces for a text (seconds from the file start).
export function mockWords(text) {
  const words = text.replace(/\[[^\]]*\]/g, ' ').match(/[\p{L}\p{N}'’]+/gu) || ['mm'];
  let t = MOCK_LEAD;
  return words.map((w) => {
    const len = 0.12 + 0.035 * Math.min(8, w.length);
    const out = { text: w, start: t, end: t + len };
    t += len + 0.07;
    return out;
  });
}

export class MockAudioProvider {
  constructor() {
    this.name = 'mock';
    this.billing = 'free (offline tones)';
    this.calls = { tts: 0, sfx: 0, music: 0, align: 0, characters: 0 };
  }

  async resolveVoice(candidates) {
    return { id: `mock-${candidates[0].toLowerCase()}`, name: candidates[0], asked: candidates[0], rank: 1 };
  }

  async tts({ text, voiceId = 'mock' }) {
    this.calls.tts++;
    this.calls.characters += text.length;
    const words = mockWords(text);
    const total = words[words.length - 1].end + 0.25;
    const pcm = new Float32Array(Math.round(total * SR) * CH);
    const f0 = 140 + 120 * hash01(voiceId);
    for (const [k, w] of words.entries()) {
      const f = f0 * (1 + 0.12 * (k % 3));
      for (let i = Math.round(w.start * SR); i < Math.round(w.end * SR); i++) {
        const x = (i - w.start * SR) / ((w.end - w.start) * SR);
        const env = Math.sin(Math.PI * x) ** 0.5;
        const v = 0.5 * env * (Math.sin((2 * Math.PI * f * i) / SR) + 0.3 * Math.sin((4 * Math.PI * f * i) / SR));
        for (let c = 0; c < CH; c++) pcm[i * CH + c] = v;
      }
    }
    return { buf: wavBuffer(pcm), ext: 'wav', info: { mock: true } };
  }

  // A hit: 0.3 s silence, a 2 ms rise to a sharp click, exponential decay over `seconds`.
  async sfx({ prompt, seconds = 1, variant = 1, loop = false }) {
    this.calls.sfx++;
    if (loop) return this.bed({ prompt, seconds });
    const len = Math.max(0.2, seconds || 1);
    const pcm = new Float32Array(Math.round((MOCK_LEAD + len) * SR) * CH);
    const f = 600 + 1800 * hash01(`${prompt}|${variant}`);
    const tau = Math.max(0.03, len / 5);
    let seed = Math.round(hash01(prompt) * 1e6) + variant;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
    const s0 = Math.round(MOCK_LEAD * SR);
    for (let i = s0; i < pcm.length / CH; i++) {
      const t = (i - s0) / SR;
      const rise = Math.min(1, t / 0.002);
      const v = 0.8 * rise * Math.exp(-t / tau) * (0.6 * Math.sin(2 * Math.PI * f * t) + 0.4 * rnd());
      for (let c = 0; c < CH; c++) pcm[i * CH + c] = v;
    }
    return { buf: wavBuffer(pcm), ext: 'wav', info: { mock: true } };
  }

  // A steady bed (ambience, loops): 0.3 s silence, then soft filtered noise for `seconds`.
  bed({ prompt, seconds = 10 }) {
    const n = Math.round((MOCK_LEAD + seconds) * SR);
    const pcm = new Float32Array(n * CH);
    let seed = Math.round(hash01(prompt) * 1e6) + 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
    let y = 0;
    for (let i = Math.round(MOCK_LEAD * SR); i < n; i++) {
      y = 0.97 * y + 0.03 * rnd();
      for (let c = 0; c < CH; c++) pcm[i * CH + c] = 2 * y;
    }
    return { buf: wavBuffer(pcm), ext: 'wav', info: { mock: true } };
  }

  // A click track: 0.3 s silence, then one click per beat at the prompt's BPM (accent on beat 1)
  // over a soft pad, so beat detection and the hard stop can be tested.
  async music({ prompt, seconds = 20 }) {
    this.calls.music++;
    const bpm = Number((String(prompt).match(/(\d+)\s*BPM/i) || [])[1]) || 120;
    const n = Math.round((MOCK_LEAD + seconds) * SR);
    const pcm = new Float32Array(n * CH);
    const period = 60 / bpm;
    for (let i = 0; i < n; i++) {
      const t = i / SR - MOCK_LEAD;
      if (t < 0) continue;
      const k = Math.floor(t / period);
      const dt = t - k * period;
      const click = dt < 0.06 ? Math.exp(-dt / 0.012) * Math.sin(2 * Math.PI * (k % 4 === 0 ? 1600 : 1000) * dt) * (k % 4 === 0 ? 0.9 : 0.55) : 0;
      const pad = 0.05 * Math.sin(2 * Math.PI * 220 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.25 * t));
      for (let c = 0; c < CH; c++) pcm[i * CH + c] = click + pad;
    }
    return { buf: wavBuffer(pcm), ext: 'wav', info: { mock: true, bpm } };
  }

  async align(_file, text) {
    this.calls.align++;
    return { words: mockWords(text), loss: 0 };
  }

  async usage() {
    return null;
  }

  price() {
    return 0;
  }
}
