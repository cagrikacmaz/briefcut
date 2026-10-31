// Video provider interface. One video model per film (set once with "Video model:" in the brief).
// Every provider implements:
//   name, billing, docs                      strings for the report and docs/PROVIDERS.md
//   submit({ scene, prompt, aspect, seconds, resolution, model }) -> job { id, ...provider fields }
//   poll(job) -> { status: 'queued' | 'running' | 'done' | 'failed', videoUrl?, error? }
//   download(job, dest) -> dest
//   estimate({ seconds, resolution, model }) -> USD or null
// `handoff` has no API: it writes the scene prompts for a person or a browser agent to paste
// into a web tool, and `briefcut ingest` takes the downloads.
import { HandoffProvider } from './handoff.mjs';
import { MockVideoProvider } from './mock.mjs';
import { HiggsfieldProvider } from './higgsfield.mjs';
import { GeminiOmniProvider } from './gemini-omni.mjs';
import { FalProvider } from './fal.mjs';

export const VIDEO_PROVIDERS = {
  handoff: HandoffProvider,
  mock: MockVideoProvider,
  higgsfield: HiggsfieldProvider,
  'gemini-omni': GeminiOmniProvider,
  fal: FalProvider,
};

export function videoProvider(name, opts) {
  const P = VIDEO_PROVIDERS[name];
  if (!P) throw new Error(`unknown video provider "${name}" (have: ${Object.keys(VIDEO_PROVIDERS).join(', ')})`);
  return new P(opts);
}

export { fetchToFile } from './download.mjs';
