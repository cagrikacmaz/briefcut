// Builds the README visuals in media/ from a rendered film folder:
//   node media/build.mjs <filmDir>
// pipeline.png (the loop, for social cards), midnight-preview.mp4 (the whole film) + .gif (its last
// 7.75 s), sync_check.jpg, take-sheets.jpg (every downloaded take's 2 fps sheet, used and
// rejected, labelled).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffmpeg } from '../src/core/ff.mjs';
import { findFont, filterPath } from '../src/core/video.mjs';
import { ensureDir } from '../src/core/util.mjs';

const MEDIA = path.dirname(fileURLToPath(import.meta.url));
const film = path.resolve(process.argv[2] || '.');
const work = ensureDir(path.join(MEDIA, '.work'));
const regular = findFont(['arial.ttf', 'DejaVuSans.ttf']);
const bold = findFont(['arialbd.ttf', 'DejaVuSans-Bold.ttf']) || regular;

const ROWS = [
  ['brief.md', 'you write the film and the rules', 'human'],
  ['scene prompts', 'flow_brief.md, written from the brief', 'agent'],
  ['generate clips', 'API provider, or a browser agent in your own video tool', 'agent + provider'],
  ['download, move into clips/', 'browser agent, or briefcut ingest --from ~/Downloads --since 30m', 'agent + code'],
  ['contact sheets, pick takes', 'the agent looks at 2 fps sheets, writes clips/NOTES.md', 'agent'],
  ['find events, pin frames', '2 fps sheet, then 8 and 24 fps strips, into out/cues.md', 'agent'],
  ['voices, music, SFX, ambience', 'audio provider, cached, never paid twice', 'code + provider'],
  ['cut, mix, master, export', 'frame-exact edit, two-pass loudness, 9:16 + 16:9', 'code'],
  ['sync_check.jpg + QA REPORT.md', 'the agent checks every cue against its frame, iterates', 'agent'],
];
const COLOR = { human: '0x6b7280', agent: '0x2563eb', code: '0x059669', provider: '0xd97706' };

async function pipelinePng() {
  const W = 1640;
  const top = 120;
  const rowH = 96;
  const H = top + ROWS.length * rowH + 70;
  const f = [];
  const text = (t, x, y, size, color, font = regular) => {
    const file = path.join(work, `t${f.length}.txt`);
    fs.writeFileSync(file, t);
    f.push(`drawtext=fontfile=${filterPath(font)}:textfile=${filterPath(file)}:x=${x}:y=${y}:fontsize=${size}:fontcolor=${color}`);
  };
  f.push(`drawbox=x=0:y=0:w=${W}:h=${H}:color=0xd1d5db:t=3`);
  text('briefcut: brief in, film out', 60, 40, 44, '0x111827', bold);
  ROWS.forEach(([name, desc, who], i) => {
    const y = top + i * rowH;
    const actors = who.split(' + ');
    const c = COLOR[actors[0]];
    f.push(`drawbox=x=60:y=${y}:w=1150:h=74:color=0xf3f4f6:t=fill`);
    f.push(`drawbox=x=60:y=${y}:w=10:h=74:color=${c}:t=fill`);
    text(String(i + 1), 92, y + 20, 34, c, bold);
    text(name, 150, y + 10, 30, '0x111827', bold);
    text(desc, 150, y + 46, 22, '0x374151');
    let x = 1240;
    for (const a of actors) {
      const w = a.length * 15 + 30;
      f.push(`drawbox=x=${x}:y=${y + 20}:w=${w}:h=36:color=${COLOR[a]}:t=fill`);
      text(a, x + 15, y + 28, 22, 'white', bold);
      x += w + 10;
    }
    if (i < ROWS.length - 1) f.push(`drawbox=x=104:y=${y + 74}:w=4:h=22:color=0x9ca3af:t=fill`);
  });
  // Loop back from the QA row to event detection.
  const y6 = top + 5 * rowH + 37;
  const y9 = top + 8 * rowH + 37;
  f.push(`drawbox=x=1215:y=${y6}:w=20:h=4:color=0x2563eb:t=fill`, `drawbox=x=1231:y=${y6}:w=4:h=${y9 - y6}:color=0x2563eb:t=fill`, `drawbox=x=1215:y=${y9}:w=20:h=4:color=0x2563eb:t=fill`);
  text('steps 6 to 9 repeat until every sound sits on its frame; the human reviews the QA report', 60, H - 50, 22, '0x6b7280');
  const out = path.join(MEDIA, 'pipeline.png');
  await ffmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=white:s=${W}x${H}:d=1`, '-vf', f.join(','), '-frames:v', '1', out]);
  return out;
}

// The whole film from the newest social master (-10 LUFS: a README player does not normalize),
// else the newest master, at 720x1280; the silent GIF fallback is its last 7.75 s.
async function preview() {
  const names = fs.readdirSync(path.join(film, 'out'));
  const newest = (re) => names.filter((n) => re.test(n)).sort((a, b) => Number(b.match(/_v(\d+)\.mp4$/)?.[1] || 1) - Number(a.match(/_v(\d+)\.mp4$/)?.[1] || 1))[0];
  const src = path.join(film, 'out', newest(/^[A-Z0-9]+_social(_v\d+)?\.mp4$/) || newest(/_master(_v\d+)?\.mp4$/));
  const mp4 = path.join(MEDIA, 'midnight-preview.mp4');
  await ffmpeg(['-y', '-v', 'error', '-i', src, '-vf', 'scale=720:1280:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4]);
  const gif = path.join(MEDIA, 'midnight-preview.gif');
  const pal = path.join(work, 'pal.png');
  await ffmpeg(['-y', '-v', 'error', '-sseof', '-7.75', '-i', mp4, '-vf', 'fps=12,scale=270:-2:flags=lanczos,palettegen=max_colors=128', pal]);
  await ffmpeg(['-y', '-v', 'error', '-sseof', '-7.75', '-i', mp4, '-i', pal, '-lavfi', 'fps=12,scale=270:-2:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4', gif]);
  return [mp4, gif];
}

async function takeSheets() {
  const sheets = path.join(film, 'out', 'sheets');
  const notes = fs.readFileSync(path.join(film, 'clips', 'NOTES.md'), 'utf8');
  const sceneOf = (n) => (notes.split('\n').find((l) => l.includes(n.match(/_([0-9a-f]{8})\.jpg$/)[1])) || '').split('|')[1]?.trim() || n;
  const takes = fs.readdirSync(sheets).filter((n) => /_[0-9a-f]{8}\.jpg$/.test(n)).sort((a, b) => sceneOf(a).localeCompare(sceneOf(b)) || a.localeCompare(b));
  const imgs = [];
  for (const [i, t] of takes.entries()) {
    const id = t.match(/_([0-9a-f]{8})\.jpg$/)[1];
    const row = notes.split('\n').find((l) => l.includes(id)) || '';
    const used = row.split('|')[2]?.includes(id);
    const label = path.join(work, `take${i}.txt`);
    fs.writeFileSync(label, `${row.split('|')[1]?.trim() || ''} take ${id}: ${used ? 'USED' : 'rejected'}`);
    const out = path.join(work, `take_${String(i).padStart(2, '0')}.png`);
    await ffmpeg(['-y', '-v', 'error', '-i', path.join(sheets, t), '-vf', `scale=1400:-2,pad=iw:ih+44:0:44:white,drawtext=fontfile=${filterPath(bold)}:textfile=${filterPath(label)}:x=10:y=10:fontsize=26:fontcolor=${used ? '0x059669' : '0xb91c1c'}`, out]);
    imgs.push(out);
  }
  const list = path.join(work, 'takes.txt');
  const out = path.join(MEDIA, 'take-sheets.jpg');
  await ffmpeg(['-y', '-v', 'error', '-framerate', '1', '-i', path.join(work, 'take_%02d.png'), '-vf', `tile=1x${imgs.length}:padding=6:color=white,scale=1100:-2`, '-frames:v', '1', '-q:v', '4', out]);
  fs.rmSync(list, { force: true });
  return out;
}

const made = [await pipelinePng(), ...(await preview()), await takeSheets()];
fs.copyFileSync(path.join(film, 'out', 'sync_check.jpg'), path.join(MEDIA, 'sync_check.jpg'));
fs.rmSync(work, { recursive: true, force: true });
for (const m of [...made, path.join(MEDIA, 'sync_check.jpg')]) console.log(`${path.basename(m)} ${(fs.statSync(m).size / 1e6).toFixed(2)} MB`);
