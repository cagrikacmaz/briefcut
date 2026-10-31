// Local audio: your own files instead of a generator. Put them in <film>/audio/local/ named after
// the asset they replace (any format ffmpeg reads):
//   vo_<row>_<voice>.wav      a voice line (audio map row number, voice name in lower case)
//   sfx_<name>_<variant>.wav  a sound effect variant from the SFX table
//   music_take<k>.wav         a music take
//   ambience.wav              the ambience bed
// A missing file is an error naming the file; nothing is generated.
import fs from 'node:fs';
import path from 'node:path';

export class LocalAudioProvider {
  constructor({ filmDir } = {}) {
    this.name = 'local';
    this.billing = 'free (your files)';
    this.dir = path.join(filmDir || '.', 'audio', 'local');
  }

  find(base) {
    if (!fs.existsSync(this.dir)) throw new Error(`local audio: folder ${this.dir} does not exist`);
    const f = fs.readdirSync(this.dir).find((n) => n.replace(/\.[^.]+$/, '').toLowerCase() === base.toLowerCase());
    if (!f) throw new Error(`local audio: no file named ${base}.* in ${this.dir}`);
    return { buf: fs.readFileSync(path.join(this.dir, f)), ext: path.extname(f).slice(1) || 'wav', info: { local: f } };
  }

  async resolveVoice(candidates) {
    return { id: `local-${candidates[0].toLowerCase()}`, name: candidates[0], asked: candidates[0], rank: 1 };
  }

  async tts({ asset }) {
    return this.find(asset);
  }

  async sfx({ asset }) {
    return this.find(asset);
  }

  async music({ asset }) {
    return this.find(asset);
  }

  async align() {
    return null;
  }

  async usage() {
    return null;
  }

  price() {
    return 0;
  }
}
