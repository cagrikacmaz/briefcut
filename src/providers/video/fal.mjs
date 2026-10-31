// fal.ai queue API. Checked against fal.ai/docs on 2026-10-31: POST https://queue.fal.run/{model}
// with "Authorization: Key <FAL_KEY>" -> { request_id, status_url, response_url }; status
// IN_QUEUE | IN_PROGRESS | COMPLETED (a failed job also ends COMPLETED, with an error field);
// result { video: { url } }. Status and result URLs use owner/app only, so the returned URLs are
// used rather than built. Default model: Seedance 2.0 text-to-video (480p or 720p in the API).
import { readKey, scrub } from '../../core/env.mjs';
import { fetchToFile } from './download.mjs';

const QUEUE = 'https://queue.fal.run';
export const DEFAULT_MODEL = 'bytedance/seedance-2.0/text-to-video';
const USD_PER_SECOND = { '720p': 0.3034, '480p': 0.15 };

export class FalProvider {
  constructor({ filmDir, log, fetchImpl = globalThis.fetch, key = null } = {}) {
    this.name = 'fal';
    this.billing = 'prepaid USD balance, per second of video (Seedance 2.0 720p about 0.30 USD/s)';
    this.docs = 'https://fal.ai/docs/model-apis/model-endpoints/queue';
    this.filmDir = filmDir;
    this.log = log;
    this.fetch = fetchImpl;
    this._key = key;
  }

  get key() {
    this._key ??= readKey('FAL_KEY', this.filmDir).value;
    return this._key;
  }

  async call(method, url, json) {
    const res = await this.fetch(url, { method, headers: { authorization: `Key ${this.key}`, 'content-type': 'application/json' }, body: json ? JSON.stringify(json) : undefined, signal: AbortSignal.timeout(60000) });
    const text = await res.text();
    if (!res.ok) throw new Error(`fal ${method} ${new URL(url).pathname} -> ${res.status}: ${scrub(text.slice(0, 400))}`);
    return text ? JSON.parse(text) : {};
  }

  body({ prompt, aspect, seconds, resolution }) {
    const res = resolution === '480p' ? '480p' : '720p';
    return { prompt, aspect_ratio: aspect || '9:16', duration: String(Math.round(Math.min(15, Math.max(4, seconds || 8)))), resolution: res, generate_audio: false };
  }

  async submit(spec) {
    const model = spec.model || DEFAULT_MODEL;
    if (spec.resolution && !['480p', '720p'].includes(spec.resolution)) this.log?.assume('video resolution', `fal's ${model} API takes 480p or 720p; asked for ${spec.resolution}, sent 720p`);
    const r = await this.call('POST', `${QUEUE}/${model}`, this.body(spec));
    return { id: r.request_id, statusUrl: r.status_url, responseUrl: r.response_url, model };
  }

  async poll(job) {
    const s = await this.call('GET', job.statusUrl);
    if (s.status === 'COMPLETED') {
      if (s.error) return { status: 'failed', error: scrub(String(s.error)).slice(0, 200) };
      const r = await this.call('GET', job.responseUrl);
      return r.video?.url ? { status: 'done', videoUrl: r.video.url } : { status: 'failed', error: 'no video in result' };
    }
    return { status: s.status === 'IN_PROGRESS' ? 'running' : 'queued' };
  }

  async download(job, dest) {
    return fetchToFile(this.fetch, job.videoUrl, dest);
  }

  async estimate({ seconds = 8, resolution = '720p' }) {
    return (USD_PER_SECOND[resolution] ?? USD_PER_SECOND['720p']) * seconds;
  }
}
