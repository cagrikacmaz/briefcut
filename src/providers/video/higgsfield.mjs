// Higgsfield: one key for several video model families (Seedance, Kling, Wan, Hailuo and more).
// Checked against docs.higgsfield.ai on 2026-10-31: base https://api.higgsfield.ai, header
// "Authorization: Key <KEY_ID>:<KEY_SECRET>", POST /{endpoint} -> { request_id, status_url },
// GET status_url until completed | failed | nsfw | canceled, result video.url, cost estimate via
// POST /estimate/{endpoint}. The docs list no Veo model and no balance endpoint.
import { readKey, scrub } from '../../core/env.mjs';
import { fetchToFile } from './download.mjs';

const BASE = 'https://api.higgsfield.ai';

// Model name in the brief -> endpoint. Unknown names are used as an endpoint path as written.
export const HIGGSFIELD_MODELS = {
  'seedance-2.0': 'bytedance/seedance-2.0/text-to-video',
  'kling-3.0-pro': 'kling-video/v3.0/pro/text-to-video',
  'kling-3.0-std': 'kling-video/v3.0/std/text-to-video',
};

export class HiggsfieldProvider {
  constructor({ filmDir, log, fetchImpl = globalThis.fetch, key = null, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    this.name = 'higgsfield';
    this.billing = 'prepaid USD balance, charged per successful job (failed and nsfw jobs refunded)';
    this.docs = 'https://docs.higgsfield.ai';
    this.filmDir = filmDir;
    this.log = log;
    this.fetch = fetchImpl;
    this.sleep = sleep;
    this._key = key;
  }

  get auth() {
    if (!this._key) {
      const k = readKey('HIGGSFIELD_API_KEY', this.filmDir, { required: false });
      if (k) this._key = k.value;
      else {
        const id = readKey('HF_API_KEY', this.filmDir).value;
        const secret = readKey('HF_API_SECRET', this.filmDir).value;
        this._key = `${id}:${secret}`;
      }
    }
    return `Key ${this._key}`;
  }

  endpoint(model) {
    return HIGGSFIELD_MODELS[model] || model || HIGGSFIELD_MODELS['seedance-2.0'];
  }

  body({ prompt, aspect, seconds, resolution, model }) {
    const ep = this.endpoint(model);
    const b = { prompt };
    if (/seedance/.test(ep)) Object.assign(b, { duration: Math.round(Math.min(15, Math.max(4, seconds || 8))), resolution: resolution || '1080p', aspect_ratio: aspect || '9:16', generate_audio: false });
    else if (/kling/.test(ep)) Object.assign(b, { duration: Math.round(Math.min(15, Math.max(3, seconds || 8))), aspect_ratio: aspect || '9:16', sound: 'off' });
    else Object.assign(b, { duration: seconds || 8, aspect_ratio: aspect || '9:16' });
    return b;
  }

  async call(method, url, json, extraHeaders = {}) {
    const res = await this.fetch(url, { method, headers: { authorization: this.auth, 'content-type': 'application/json', accept: 'application/json', ...extraHeaders }, body: json ? JSON.stringify(json) : undefined, signal: AbortSignal.timeout(60000) });
    const text = await res.text();
    if (!res.ok) throw new Error(`Higgsfield ${method} ${new URL(url).pathname} -> ${res.status}: ${scrub(text.slice(0, 400))}`);
    return text ? JSON.parse(text) : {};
  }

  async submit(spec) {
    const ep = this.endpoint(spec.model);
    const r = await this.call('POST', `${BASE}/${ep}`, this.body(spec), { 'Idempotency-Key': spec.idempotencyKey || `${spec.scene}-${spec.take || 1}-${Date.now()}` });
    return { id: r.request_id, statusUrl: r.status_url || `${BASE}/requests/${r.request_id}/status`, cancelUrl: r.cancel_url, endpoint: ep };
  }

  async poll(job) {
    const r = await this.call('GET', job.statusUrl);
    const s = String(r.status || '').toLowerCase();
    if (s === 'completed') return { status: 'done', videoUrl: r.video?.url, expiresAt: r.expires_at };
    if (['failed', 'nsfw', 'canceled'].includes(s)) return { status: 'failed', error: `${s}${r.error ? `: ${scrub(JSON.stringify(r.error)).slice(0, 200)}` : ''}` };
    return { status: s === 'in_progress' ? 'running' : 'queued' };
  }

  async download(job, dest) {
    if (!job.videoUrl) throw new Error('Higgsfield: job has no video URL yet');
    return fetchToFile(this.fetch, job.videoUrl, dest);
  }

  async estimate(spec) {
    const ep = this.endpoint(spec.model);
    const r = await this.call('POST', `${BASE}/estimate/${ep}`, this.body({ prompt: 'estimate', ...spec }));
    return r.usd != null ? Number(r.usd) : null;
  }
}
