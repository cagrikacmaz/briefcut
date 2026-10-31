// Mastering: gain to target, true-peak-safe limiting (4x oversampled, latency compensated so
// nothing moves against the picture), then two-pass linear loudnorm.
import path from 'node:path';
import { ffmpeg, parseLoudnormJson } from './ff.mjs';
import { undb } from './util.mjs';

async function loudnormMeasure(file, L) {
  const { stderr } = await ffmpeg(['-nostats', '-i', file, '-af', `loudnorm=I=${L.I}:TP=${L.TP}:LRA=${L.LRA}:print_format=json`, '-f', 'null', '-']);
  return parseLoudnormJson(stderr);
}

// Gain that moves `measuredI` to `targetI`; with a limiter this is the pre-limiter gain.
export const gainToTarget = (targetI, measuredI) => targetI - measuredI;

// Within tolerance and under the true-peak ceiling: the loudness QA rule.
export const loudnessOk = (m, L) => Number.isFinite(m.I) && Math.abs(m.I - L.I) <= L.tolerance + 1e-9 && m.TP <= L.TP + 1e-9;

// The gain into the limiter is iterated until the limited signal itself sits at the target
// loudness (limiting lowers loudness, more so on peaky material), so the final loudnorm pass is
// a small linear trim and never falls back to dynamic mode.
// `bias` (LU) shifts loudnorm's target: loudnorm's own meter can read a short film 0.5-1 LU away
// from the EBU R128 meter (ebur128) that QA uses on the export, so the caller measures the
// export and passes the difference back in.
export async function masterMix(premaster, workDir, L0, ceilingDb, log, { bias = 0 } = {}) {
  const L = { ...L0, I: Number((L0.I + bias).toFixed(2)) };
  const pre = await loudnormMeasure(premaster, L);
  let gain = gainToTarget(L.I, Number(pre.input_i));
  const limited = path.join(workDir, 'mix_limited.wav');
  const limit = undb(ceilingDb).toFixed(5);
  let pass1;
  for (let k = 0; k < 5; k++) {
    await ffmpeg([
      '-y', '-v', 'error', '-i', premaster,
      '-af', `volume=${gain.toFixed(3)}dB,aresample=192000,alimiter=limit=${limit}:attack=5:release=60:level=false:latency=true,aresample=48000`,
      '-c:a', 'pcm_f32le', limited,
    ]);
    pass1 = await loudnormMeasure(limited, L);
    const miss = L.I - Number(pass1.input_i);
    if (Math.abs(miss) <= 0.1 || gain + miss > 30) break;
    gain += miss;
  }
  const out = path.join(workDir, 'mix_master.wav');
  const { stderr } = await ffmpeg([
    '-y', '-nostats', '-i', limited,
    '-af',
    `loudnorm=I=${L.I}:TP=${L.TP}:LRA=${L.LRA}:measured_I=${pass1.input_i}:measured_TP=${pass1.input_tp}:measured_LRA=${pass1.input_lra}:measured_thresh=${pass1.input_thresh}:linear=true:print_format=json,aresample=48000`,
    '-c:a', 'pcm_f32le', '-ar', '48000', out,
  ]);
  const pass2 = parseLoudnormJson(stderr);
  if (pass2.normalization_type !== 'linear') log?.warn(`loudnorm pass 2 ran as ${pass2.normalization_type}, not linear`);
  return { file: out, pre, gain, ceilingDb, pass1, pass2, bias };
}
