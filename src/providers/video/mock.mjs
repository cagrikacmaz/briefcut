// Mock video: ffmpeg test-pattern clips with full-frame white flashes on known frames, so event
// detection and frame-exact sync can be tested without any generator. The flash frames come from
// a scene's "Mock events:" line (`hit_1=12, hit_2=36`) and are written to <clip>.events.json.
import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg } from '../../core/ff.mjs';

export function parseMockEvents(prompt) {
  const m = String(prompt).match(/Mock events:\s*([^\n]+)/i);
  if (!m) return {};
  return Object.fromEntries([...m[1].matchAll(/`?([\w-]+)`?\s*=\s*(\d+)/g)].map((x) => [x[1].toLowerCase(), Number(x[2])]));
}

export class MockVideoProvider {
  constructor({ cfg } = {}) {
    this.name = 'mock';
    this.billing = 'free (ffmpeg test pattern)';
    this.docs = 'src/providers/video/mock.mjs';
    this.cfg = cfg;
  }

  async submit(spec) {
    return { id: `mock-${spec.scene}`, spec };
  }

  async poll() {
    return { status: 'done' };
  }

  // Renders the clip straight to `dest`; flashes are pure white frames.
  async download(job, dest) {
    const { spec } = job;
    const W = spec.width || 720;
    const H = spec.height || 1280;
    const fps = spec.fps || 24;
    const frames = Math.round((spec.seconds || 3) * fps);
    const events = parseMockEvents(spec.raw ?? spec.prompt);
    const flash = Object.values(events);
    const enable = flash.length ? flash.map((f) => `eq(n\\,${f})`).join('+') : '0';
    const hue = (spec.index || 0) * 70;
    await ffmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=s=${W}x${H}:r=${fps}:d=${(frames / fps).toFixed(4)}`, '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:d=${(frames / fps).toFixed(4)}`, '-vf', `hue=h=${hue},eq=brightness=-0.15,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='${enable}'`, '-frames:v', String(frames), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', dest]);
    fs.writeFileSync(dest.replace(/\.mp4$/i, '.events.json'), JSON.stringify({ fps, frames, events }, null, 2) + '\n');
    return dest;
  }

  async estimate() {
    return 0;
  }
}

export const mockClipName = (scene) => `${scene}.mp4`;
export { path };
