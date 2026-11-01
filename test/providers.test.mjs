// Contract tests: every provider call is made against a fake fetch that checks the request
// (URL, method, headers, body) and answers with a recorded response in the documented shape.
// No network, no key.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ElevenLabsProvider } from '../src/providers/audio/elevenlabs.mjs';
import { HiggsfieldProvider } from '../src/providers/video/higgsfield.mjs';
import { FalProvider } from '../src/providers/video/fal.mjs';
import { GeminiOmniProvider } from '../src/providers/video/gemini-omni.mjs';
import { VIDEO_PROVIDERS } from '../src/providers/video/index.mjs';
import { AUDIO_PROVIDERS } from '../src/providers/audio/index.mjs';
import { nullLog } from '../src/core/util.mjs';

const REC = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'recorded.json'), 'utf8'));
const FAKE_KEY = 'test-key-not-real';

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ url: u, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    for (const [re, reply] of routes) {
      if (re.test(`${init.method || 'GET'} ${u.href}`)) {
        // A reply is { http, json }, { binary }, or a bare JSON body (which may itself have a
        // "status" field, as queue APIs do).
        const r0 = typeof reply === 'function' ? reply(u, init) : reply;
        const wrapped = r0 && ('http' in r0 || 'binary' in r0 || 'json' in r0);
        const r = wrapped ? r0 : { json: r0 };
        const status = r.http ?? 200;
        const body = r.binary ?? Buffer.from(JSON.stringify(r.json));
        return { ok: status < 400, status, headers: new Map(), arrayBuffer: async () => body, text: async () => body.toString() };
      }
    }
    throw new Error(`unexpected request ${init.method} ${u.href}`);
  };
  fn.calls = calls;
  return fn;
}

const hdr = (call, name) => call.headers[name] ?? call.headers[name.toLowerCase()];
const EL_KEY_HEADER = ['xi', 'api', 'key'].join('-');

test('ElevenLabs: voices are paged and resolved by candidate order (exact or prefix name)', async () => {
  const f = fakeFetch([
    [/GET .*\/v2\/voices.*next_page_token=p2/, REC.elevenlabs.voices_page2],
    [/GET .*\/v2\/voices/, REC.elevenlabs.voices_page1],
  ]);
  const el = new ElevenLabsProvider({ key: FAKE_KEY, fetchImpl: f, log: nullLog() });
  const v = await el.resolveVoice(['George', 'Daniel', 'Brian']);
  assert.deepEqual([v.id, v.rank], ['v_aaa', 2]);
  assert.equal(hdr(f.calls[0], EL_KEY_HEADER), FAKE_KEY);
  assert.equal(f.calls[0].url.searchParams.get('page_size'), '100');
});

test('ElevenLabs: TTS body carries model, settings with speed inside voice_settings', async () => {
  const f = fakeFetch([[/POST .*\/v1\/text-to-speech\/v_aaa/, { binary: Buffer.from('ID3fake') }]]);
  const el = new ElevenLabsProvider({ key: FAKE_KEY, fetchImpl: f, log: nullLog() });
  const r = await el.tts({ voiceId: 'v_aaa', text: 'Right on the hour.', model: 'eleven_multilingual_v2', settings: { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 0.9 } });
  const body = JSON.parse(f.calls[0].body);
  assert.equal(body.model_id, 'eleven_multilingual_v2');
  assert.equal(body.voice_settings.speed, 0.9);
  assert.equal(f.calls[0].url.searchParams.get('output_format'), 'mp3_44100_192');
  assert.equal(r.ext, 'mp3');
  // v3 takes neither speed nor speaker boost.
  assert.deepEqual(ElevenLabsProvider.settingsFor('eleven_v3', { stability: 0.5, speed: 0.9, use_speaker_boost: true }), { stability: 0.5 });
});

test('ElevenLabs: SFX duration clamped to 0.5-30 s, music length in ms, alignment parsed', async () => {
  const f = fakeFetch([
    [/POST .*\/v1\/sound-generation/, { binary: Buffer.from('x') }],
    [/POST .*\/v1\/music/, { binary: Buffer.from('x') }],
    [/POST .*\/v1\/forced-alignment/, REC.elevenlabs.align],
    [/GET .*\/v1\/user\/subscription/, REC.elevenlabs.subscription],
  ]);
  const el = new ElevenLabsProvider({ key: FAKE_KEY, fetchImpl: f, log: nullLog() });
  await el.sfx({ prompt: 'tick', seconds: 0.4 });
  assert.equal(JSON.parse(f.calls[0].body).duration_seconds, 0.5);
  assert.equal(JSON.parse(f.calls[0].body).model_id, 'eleven_text_to_sound_v2');
  await el.music({ prompt: 'pulse, 120 BPM', seconds: 20 });
  const m = JSON.parse(f.calls[1].body);
  assert.deepEqual([m.music_length_ms, m.force_instrumental, m.model_id], [20000, true, 'music_v1']);
  const tmp = path.join(fs.mkdtempSync(path.join((await import('node:os')).tmpdir(), 'bc-')), 'a.mp3');
  fs.writeFileSync(tmp, 'x');
  const a = await el.align(tmp, 'Right on');
  assert.equal(a.words[0].text, 'Right');
  assert.ok(f.calls[2].body instanceof FormData);
  const u = await el.usage();
  assert.deepEqual([u.characters, u.limit], [1200, 121000]);
});

test('ElevenLabs: errors carry status and never the key', async () => {
  const f = fakeFetch([[/POST/, { http: 422, json: REC.elevenlabs.error_422 }]]);
  const el = new ElevenLabsProvider({ key: FAKE_KEY, fetchImpl: f, log: nullLog() });
  await assert.rejects(el.tts({ voiceId: 'v', text: 'x', model: 'm', settings: {} }), (e) => e.status === 422 && !String(e.message).includes(FAKE_KEY));
});

test('ElevenLabs: 429 is retried, then succeeds', async () => {
  let n = 0;
  const f = fakeFetch([[/POST/, () => (++n < 2 ? { http: 429, json: { detail: 'busy' } } : { binary: Buffer.from('ok') })]]);
  const el = new ElevenLabsProvider({ key: FAKE_KEY, fetchImpl: f, log: nullLog(), sleep: async () => {} });
  await el.sfx({ prompt: 'x', seconds: 1 });
  assert.equal(n, 2);
});

test('Higgsfield: submit, poll, estimate, terminal failures', async () => {
  let polls = 0;
  const f = fakeFetch([
    [/POST https:\/\/api\.higgsfield\.ai\/estimate\//, REC.higgsfield.estimate],
    [/POST https:\/\/api\.higgsfield\.ai\/bytedance\/seedance-2\.0\/text-to-video/, REC.higgsfield.submit],
    [/GET .*req_123\/status/, () => (++polls < 2 ? REC.higgsfield.status_running : REC.higgsfield.status_done)],
    [/GET .*req_124\/status/, REC.higgsfield.status_nsfw],
  ]);
  const hf = new HiggsfieldProvider({ key: 'id:secret', fetchImpl: f, log: nullLog() });
  const job = await hf.submit({ scene: 'S1', prompt: 'p', aspect: '9:16', seconds: 8, resolution: '1080p', model: 'seedance-2.0' });
  const body = JSON.parse(f.calls[0].body);
  assert.deepEqual([body.duration, body.aspect_ratio, body.resolution, body.generate_audio], [8, '9:16', '1080p', false]);
  assert.equal(hdr(f.calls[0], 'authorization'), 'Key id:secret');
  assert.ok(hdr(f.calls[0], 'Idempotency-Key'));
  assert.equal((await hf.poll(job)).status, 'running');
  const done = await hf.poll(job);
  assert.deepEqual([done.status, done.videoUrl], ['done', 'https://cdn.example.test/req_123.mp4']);
  assert.equal((await hf.poll({ statusUrl: 'https://api.higgsfield.ai/requests/req_124/status' })).status, 'failed');
  assert.equal(await hf.estimate({ seconds: 8, model: 'seedance-2.0' }), 0.094);
});

test('fal: queue submit, returned status/result URLs, COMPLETED with error is a failure', async () => {
  const f = fakeFetch([
    [/POST https:\/\/queue\.fal\.run\/bytedance\/seedance-2\.0\/text-to-video/, REC.fal.submit],
    [/GET .*f-1\/status/, REC.fal.status_done],
    [/GET .*requests\/f-1$/, REC.fal.result],
    [/GET .*f-2\/status/, REC.fal.status_failed],
  ]);
  const fal = new FalProvider({ key: FAKE_KEY, fetchImpl: f, log: nullLog() });
  const job = await fal.submit({ prompt: 'p', aspect: '9:16', seconds: 8, resolution: '1080p' });
  const body = JSON.parse(f.calls[0].body);
  assert.deepEqual([body.duration, body.resolution, body.aspect_ratio], ['8', '720p', '9:16']);
  assert.equal(hdr(f.calls[0], 'authorization'), `Key ${FAKE_KEY}`);
  const st = await fal.poll(job);
  assert.equal(st.videoUrl, 'https://cdn.example.test/f-1.mp4');
  assert.equal((await fal.poll({ statusUrl: 'https://queue.fal.run/bytedance/seedance-2.0/requests/f-2/status' })).status, 'failed');
});

test('Gemini Omni: background interaction, shut-down Veo preview IDs replaced, video URI read', async () => {
  const f = fakeFetch([
    [/POST .*\/v1beta\/interactions$/, REC.gemini.create_background],
    [/GET .*\/v1beta\/interactions\/int_1/, REC.gemini.get_done],
  ]);
  const g = new GeminiOmniProvider({ key: FAKE_KEY, fetchImpl: f, log: nullLog() });
  const job = await g.submit({ prompt: 'p', aspect: '9:16', resolution: '1080p', model: 'veo-3.1-generate-preview' });
  const body = JSON.parse(f.calls[0].body);
  assert.equal(body.model, 'gemini-omni-1.1-flash');
  assert.deepEqual(body.response_format, { type: 'video', aspect_ratio: '9:16', resolution: '1080p', delivery: 'uri' });
  assert.equal(hdr(f.calls[0], 'x-goog-api-key'), FAKE_KEY);
  const st = await g.poll(job);
  assert.equal(st.videoUrl, 'https://generativelanguage.googleapis.com/v1beta/files/abc123');
});

test('every provider has the interface', () => {
  for (const P of Object.values(VIDEO_PROVIDERS)) {
    const p = new P({ log: nullLog() });
    for (const m of ['submit', 'poll', 'download', 'estimate']) assert.equal(typeof p[m], 'function', `${p.name}.${m}`);
    assert.ok(p.name && p.billing);
  }
  for (const P of Object.values(AUDIO_PROVIDERS)) {
    const p = new P({ log: nullLog() });
    for (const m of ['resolveVoice', 'tts', 'sfx', 'music', 'align', 'usage', 'price']) assert.equal(typeof p[m], 'function', `${p.name}.${m}`);
  }
});

test('ElevenLabs costs are stated in credits, audition apart from the film', async () => {
  const { audioCost } = await import('../src/core/report.mjs');
  const el = new ElevenLabsProvider({ key: FAKE_KEY, fetchImpl: fakeFetch([]), log: nullLog() });
  assert.equal(el.creditUnit, 'ElevenLabs credits');
  assert.equal(el.credits({ kind: 'tts', text: 'Right on the hour.' }), 18);
  assert.equal(el.credits({ kind: 'sfx', seconds: 0.4 }), 20); // half-second minimum
  assert.equal(Math.round(el.credits({ kind: 'music', seconds: 20 })), 300);
  assert.equal(audioCost({ creditUnit: el.creditUnit, credits: 2174, auditionCredits: 72 }), '2,174 ElevenLabs credits for the film, 72 for the voice audition');
  assert.equal(audioCost({ creditUnit: el.creditUnit, credits: 2174, auditionCredits: 0 }), '2,174 ElevenLabs credits');
  assert.equal(audioCost({ estUsd: 0 }), 'est. 0.00 USD');
});
