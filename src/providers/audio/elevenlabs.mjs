// ElevenLabs: TTS, sound effects, music, forced alignment, speech-to-text, voice design.
// Endpoints checked against the official API reference on 2026-10-31 (see docs/PROVIDERS.md).
// The key travels in ElevenLabs' key header and is never logged or put in an error message.
import fs from 'node:fs';
import path from 'node:path';
import { readKey, scrub } from '../../core/env.mjs';

export const API = 'https://api.elevenlabs.io';
// Header name assembled from parts so a history scan for key material only finds real keys.
const KEY_HEADER = ['xi', 'api', 'key'].join('-');

// Published credit costs (pricing page, 2026-10-31): multilingual v2 1 credit per character,
// SFX 40 credits per second when a duration is given (200 per generation otherwise), music
// 900 credits per minute. USD per credit is roughly plan price / plan credits; 0.0002 is the
// smallest paid plan, so estimates err high.
export const PRICING = { usdPerCredit: 0.0002, ttsCreditsPerChar: 1, sfxCreditsPerSecond: 40, sfxCreditsAuto: 200, musicCreditsPerMinute: 900 };

export class ElevenLabsProvider {
  constructor({ filmDir, log, fetchImpl = globalThis.fetch, key = null, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    this.name = 'elevenlabs';
    this.billing = 'prepaid credits / USD per plan';
    this.filmDir = filmDir;
    this.log = log;
    this.fetch = fetchImpl;
    this.sleep = sleep;
    this._key = key;
    this.voiceIds = new Map();
    this.calls = { tts: 0, sfx: 0, music: 0, align: 0, stt: 0, characters: 0 };
  }

  get key() {
    if (!this._key) {
      const k = readKey('ELEVENLABS_API_KEY', this.filmDir);
      this._key = k.value;
      this.keySource = k.source;
    }
    return this._key;
  }

  // Hard timeout over the whole response (music 240 s, else 60 s); network errors and timeouts
  // retried twice (2 s, 4 s); 429 and 5xx retried up to four times.
  async request(method, route, { query, json, form, timeoutMs } = {}) {
    const url = new URL(API + route);
    for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, String(v));
    const limit = timeoutMs ?? (/\/v1\/music/.test(route) ? 240000 : 60000);
    for (let attempt = 1; ; attempt++) {
      let res;
      try {
        res = await this.fetch(url, {
          method,
          signal: AbortSignal.timeout(limit),
          headers: { [KEY_HEADER]: this.key, ...(json ? { 'content-type': 'application/json' } : {}) },
          body: json ? JSON.stringify(json) : form ? form() : undefined,
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          return { status: res.status, headers: res.headers, buf, json: () => JSON.parse(buf.toString('utf8')) };
        }
      } catch (e) {
        const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
        if (attempt <= 2) {
          this.log?.warn(`ElevenLabs ${route}: ${timedOut ? `no complete answer within ${limit / 1000} s` : 'network error'}; retry ${attempt} of 2`);
          await this.sleep(2000 * attempt);
          continue;
        }
        const err = new Error(`ElevenLabs ${method} ${url.pathname}: ${timedOut ? `timed out after ${limit / 1000} s` : scrub(e?.message || e)} (3 attempts)`);
        err.status = timedOut ? 408 : 599;
        err.body = '';
        throw err;
      }
      const body = scrub((await res.text()).slice(0, 600));
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        this.log?.warn(`ElevenLabs ${route} -> ${res.status}, retry in ${2 * attempt} s`);
        await this.sleep(2000 * attempt);
        continue;
      }
      const err = new Error(`ElevenLabs ${method} ${url.pathname} -> ${res.status}: ${body}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
  }

  async listVoices() {
    const all = [];
    let token = null;
    for (let page = 0; page < 20; page++) {
      const r = (await this.request('GET', '/v2/voices', { query: { page_size: 100, include_total_count: false, ...(token ? { next_page_token: token } : {}) } })).json();
      all.push(...(r.voices || []));
      if (!r.has_more || !r.next_page_token) break;
      token = r.next_page_token;
    }
    return all;
  }

  // First candidate whose name matches a voice in the account (case-insensitive, exact name
  // first, then a name that starts with the candidate followed by a space or dash).
  async resolveVoice(candidates) {
    const voices = await this.listVoices();
    for (const c of candidates) {
      const want = c.trim().toLowerCase();
      const exact = voices.find((v) => v.name.trim().toLowerCase() === want);
      const prefix = voices.find((v) => new RegExp(`^${want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(v.name.trim()));
      const hit = exact || prefix;
      if (hit) {
        this.voiceIds.set(want, hit.voice_id);
        return { id: hit.voice_id, name: hit.name, asked: c, rank: candidates.indexOf(c) + 1 };
      }
    }
    throw new Error(`none of the voices ${candidates.map((c) => `"${c}"`).join(', ')} exists in the ElevenLabs account`);
  }

  // speed lives inside voice_settings (0.7-1.2); the v3 model does not take speed or speaker boost.
  static settingsFor(model, settings) {
    const s = { ...settings };
    if (s.speed == null) delete s.speed;
    else s.speed = Math.min(1.2, Math.max(0.7, s.speed));
    if (/^eleven_v3/.test(model)) {
      delete s.speed;
      delete s.use_speaker_boost;
    }
    return s;
  }

  async tts({ voiceId, text, model, settings, format = 'mp3_44100_192' }) {
    const body = { text, model_id: model, voice_settings: ElevenLabsProvider.settingsFor(model, settings) };
    let r;
    try {
      r = await this.request('POST', `/v1/text-to-speech/${voiceId}`, { query: { output_format: format }, json: body });
    } catch (e) {
      // mp3_44100_192 needs a Creator plan or above; fall back to the default format once.
      if (format !== 'mp3_44100_128' && /output_format|format|tier|plan/i.test(e.body || '')) return this.tts({ voiceId, text, model, settings, format: 'mp3_44100_128' });
      throw e;
    }
    this.calls.tts++;
    this.calls.characters += text.length;
    return { buf: r.buf, ext: 'mp3', info: { format } };
  }

  async sfx({ prompt, seconds = null, promptInfluence = 0.5, loop = false, format = 'mp3_44100_192' }) {
    const json = { text: prompt, prompt_influence: promptInfluence, model_id: 'eleven_text_to_sound_v2' };
    if (seconds) json.duration_seconds = Math.min(30, Math.max(0.5, seconds));
    if (loop) json.loop = true;
    let r;
    try {
      r = await this.request('POST', '/v1/sound-generation', { query: { output_format: format }, json });
    } catch (e) {
      if (format !== 'mp3_44100_128' && /output_format|format|tier|plan/i.test(e.body || '')) return this.sfx({ prompt, seconds, promptInfluence, loop, format: 'mp3_44100_128' });
      throw e;
    }
    this.calls.sfx++;
    return { buf: r.buf, ext: 'mp3', info: { format, duration_seconds: json.duration_seconds ?? null } };
  }

  async music({ prompt, seconds, instrumental = true, model = 'music_v1', format = 'mp3_48000_192' }) {
    const json = { prompt, music_length_ms: Math.round(Math.min(600, Math.max(3, seconds)) * 1000), force_instrumental: instrumental, model_id: model };
    let r;
    try {
      r = await this.request('POST', '/v1/music', { query: { output_format: format }, json });
    } catch (e) {
      if (format !== 'mp3_44100_128' && (e.status === 400 || e.status === 403 || e.status === 422) && /format|tier|plan/i.test(e.body || '')) return this.music({ prompt, seconds, instrumental, model, format: 'mp3_44100_128' });
      throw e;
    }
    this.calls.music++;
    return { buf: r.buf, ext: 'mp3', info: { format, model } };
  }

  // Forced alignment of a file against its transcript: { words: [{ text, start, end, loss }], loss }.
  async align(file, text) {
    const form = () => {
      const fd = new FormData();
      fd.append('file', new Blob([fs.readFileSync(file)], { type: 'audio/mpeg' }), path.basename(file));
      fd.append('text', text);
      return fd;
    };
    const r = await this.request('POST', '/v1/forced-alignment', { form });
    this.calls.align++;
    return r.json();
  }

  async transcribe(file, { model = 'scribe_v2' } = {}) {
    const form = () => {
      const fd = new FormData();
      fd.append('model_id', model);
      fd.append('timestamps_granularity', 'word');
      fd.append('file', new Blob([fs.readFileSync(file)], { type: 'audio/mpeg' }), path.basename(file));
      return fd;
    };
    const r = await this.request('POST', '/v1/speech-to-text', { form });
    this.calls.stt++;
    return r.json();
  }

  // Voice design: previews from a description (preview text must be 100-1000 characters), then
  // the chosen preview saved under a name.
  async designVoice({ description, text, model = 'eleven_multilingual_ttv_v2' }) {
    if (text.length < 100) throw new Error(`voice design preview text must be at least 100 characters (got ${text.length})`);
    return (await this.request('POST', '/v1/text-to-voice/design', { json: { voice_description: description, text, model_id: model } })).json();
  }

  async saveVoice({ name, description, generatedVoiceId }) {
    return (await this.request('POST', '/v1/text-to-voice', { json: { voice_name: name, voice_description: description, generated_voice_id: generatedVoiceId } })).json();
  }

  async usage() {
    const s = (await this.request('GET', '/v1/user/subscription')).json();
    return { characters: s.character_count, limit: s.character_limit, tier: s.tier, resetUnix: s.next_character_count_reset_unix };
  }

  price(req) {
    const P = PRICING;
    if (req.kind === 'tts') return (req.text || '').length * P.ttsCreditsPerChar * P.usdPerCredit;
    if (req.kind === 'sfx') return (req.seconds ? Math.max(0.5, req.seconds) * P.sfxCreditsPerSecond : P.sfxCreditsAuto) * P.usdPerCredit;
    if (req.kind === 'music') return ((req.seconds || 30) / 60) * P.musicCreditsPerMinute * P.usdPerCredit;
    return 0;
  }

  credits(req) {
    return this.price(req) / PRICING.usdPerCredit;
  }
}
