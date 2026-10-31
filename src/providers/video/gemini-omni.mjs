// Gemini API video. The Veo 3.1 preview model IDs on the Gemini API were shut down on
// 2026-10-22; Google's replacement there is gemini-omni-1.1-flash on the Interactions API.
// Checked against ai.google.dev on 2026-10-31: POST /v1beta/interactions with header
// x-goog-api-key, response_format { type: "video", aspect_ratio, resolution, delivery: "uri" },
// background mode polled at GET /v1beta/interactions/{id}. Not documented (so not relied on):
// a duration parameter, and whether background mode is supported for this model; when the
// create call returns the finished interaction directly, it is used as is.
import fs from 'node:fs';
import { readKey, scrub } from '../../core/env.mjs';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_MODEL = 'gemini-omni-1.1-flash';

export class GeminiOmniProvider {
  constructor({ filmDir, log, fetchImpl = globalThis.fetch, key = null } = {}) {
    this.name = 'gemini-omni';
    this.billing = 'pay as you go on the Gemini API key (about 0.10 USD per second of 720p video)';
    this.docs = 'https://ai.google.dev/gemini-api/docs/omni';
    this.filmDir = filmDir;
    this.log = log;
    this.fetch = fetchImpl;
    this._key = key;
  }

  get key() {
    this._key ??= (readKey('GEMINI_API_KEY', this.filmDir, { required: false }) || readKey('GOOGLE_API_KEY', this.filmDir)).value;
    return this._key;
  }

  async call(method, url, json) {
    const res = await this.fetch(url, { method, headers: { 'x-goog-api-key': this.key, 'content-type': 'application/json' }, body: json ? JSON.stringify(json) : undefined, signal: AbortSignal.timeout(600000) });
    const text = await res.text();
    if (!res.ok) throw new Error(`Gemini ${method} ${new URL(url).pathname} -> ${res.status}: ${scrub(text.slice(0, 400))}`);
    return text ? JSON.parse(text) : {};
  }

  body({ prompt, aspect, resolution, model }) {
    return {
      model: model && !/^veo-3\.1-.*preview$/.test(model) ? model : DEFAULT_MODEL,
      input: prompt,
      response_format: { type: 'video', aspect_ratio: aspect === '16:9' ? '16:9' : '9:16', resolution: resolution || '1080p', delivery: 'uri' },
      generation_config: { video_config: { task: 'text_to_video' } },
      background: true,
    };
  }

  static videoOf(interaction) {
    for (const step of interaction.steps || []) {
      for (const c of step.content || []) if (c.type === 'video') return { uri: c.uri || null, data: c.data || null, mime: c.mime_type };
    }
    return null;
  }

  async submit(spec) {
    if (spec.model && /^veo-3\.1-.*preview$/.test(spec.model)) this.log?.assume('video model', `${spec.model} was shut down on the Gemini API on 2026-10-22; using ${DEFAULT_MODEL}`);
    const r = await this.call('POST', `${BASE}/interactions`, this.body(spec));
    return { id: r.id, immediate: r.status === 'completed' ? r : null };
  }

  async poll(job) {
    const r = job.immediate || (await this.call('GET', `${BASE}/interactions/${job.id}`));
    if (r.status === 'completed') {
      const v = GeminiOmniProvider.videoOf(r);
      if (!v) return { status: 'failed', error: 'completed without a video' };
      return { status: 'done', videoUrl: v.uri, videoData: v.data };
    }
    if (['failed', 'cancelled'].includes(r.status)) return { status: 'failed', error: r.status };
    return { status: 'running' };
  }

  async download(job, dest) {
    if (job.videoData) {
      fs.writeFileSync(dest, Buffer.from(job.videoData, 'base64'));
      return dest;
    }
    // A file URI: wait until the file is ACTIVE, then download it with the key header.
    const id = String(job.videoUrl).match(/files\/([^/:?]+)/)?.[1];
    if (id) {
      for (let i = 0; i < 60; i++) {
        const f = await this.call('GET', `${BASE}/files/${id}`);
        if (f.state === 'ACTIVE') break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      const res = await this.fetch(`${BASE}/files/${id}:download?alt=media`, { headers: { 'x-goog-api-key': this.key }, redirect: 'follow' });
      if (!res.ok) throw new Error(`Gemini file download -> ${res.status}`);
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      return dest;
    }
    const res = await this.fetch(job.videoUrl, { headers: { 'x-goog-api-key': this.key }, redirect: 'follow' });
    if (!res.ok) throw new Error(`Gemini video download -> ${res.status}`);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return dest;
  }

  async estimate({ seconds = 8 }) {
    return 0.1 * seconds;
  }
}
