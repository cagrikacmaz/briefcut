// Audio provider interface. Every provider implements:
//   name, billing                                   strings for the report and docs
//   resolveVoice(candidates[]) -> { id, name }       first candidate that exists in the account
//   tts({ voiceId, text, model, settings }) -> { buf, ext }
//   sfx({ prompt, seconds }) -> { buf, ext }
//   music({ prompt, seconds, instrumental }) -> { buf, ext }
//   align(file, text) -> { words: [{ text, start, end }] } | null
//   usage() -> { characters, limit } | null          account counters, if the API has them
//   price(request) -> USD estimate for one request (0 when free or unknown)
import { ElevenLabsProvider } from './elevenlabs.mjs';
import { MockAudioProvider } from './mock.mjs';
import { LocalAudioProvider } from './local.mjs';

export const AUDIO_PROVIDERS = {
  elevenlabs: ElevenLabsProvider,
  mock: MockAudioProvider,
  local: LocalAudioProvider,
};

export function audioProvider(name, opts) {
  const P = AUDIO_PROVIDERS[name];
  if (!P) throw new Error(`unknown audio provider "${name}" (have: ${Object.keys(AUDIO_PROVIDERS).join(', ')})`);
  return new P(opts);
}
