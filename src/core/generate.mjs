// `briefcut generate`: scene clips from an API video provider. Jobs are asynchronous and persisted
// in out/jobs.json, so an interrupted run resumes polling instead of paying again. Takes land in
// clips/_takes/ (the mock provider writes straight to clips/). Choosing takes stays a separate,
// visual step.
import fs from 'node:fs';
import path from 'node:path';
import { videoProvider } from '../providers/video/index.mjs';
import { scenePrompt, writeFlowBrief } from './prompts.mjs';
import { ensureDir, readJson, writeJson } from './util.mjs';

export async function generateClips({ cfg, filmDir, providerName, takes = 1, maxSpend = null, log, fetchImpl, pollMs = 5000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), seconds = 8 }) {
  const name = providerName || cfg.video.provider;
  const vp = videoProvider(name, { filmDir, log, cfg, ...(fetchImpl ? { fetchImpl } : {}) });
  if (name === 'handoff') {
    const file = writeFlowBrief(cfg, filmDir, { takes: Math.max(2, takes) });
    log.info(`handoff: wrote ${path.basename(file)}; generate the takes in your video tool, then run briefcut ingest`);
    return { handoff: file };
  }
  if (!cfg.scenes.length) throw new Error('the brief has no "## Scenes" section to generate from');
  const jobsFile = path.join(ensureDir(path.join(filmDir, 'out')), 'jobs.json');
  const jobs = readJson(jobsFile, { provider: name, model: cfg.video.model, jobs: [] });
  if (jobs.provider !== name || (jobs.model ?? null) !== (cfg.video.model ?? null)) throw new Error(`out/jobs.json was made with ${jobs.provider}/${jobs.model}; one video model per film (move jobs.json aside to switch)`);
  const aspect = cfg.height > cfg.width ? '9:16' : '16:9';
  const dest = ensureDir(path.join(filmDir, name === 'mock' ? 'clips' : path.join('clips', '_takes')));

  // Spend guard before any submit.
  const per = await vp.estimate({ seconds, resolution: '1080p', model: cfg.video.model }).catch(() => null);
  const newJobs = cfg.scenes.length * takes - jobs.jobs.length;
  if (maxSpend != null && per != null && per * Math.max(0, newJobs) > maxSpend + 1e-9) throw new Error(`--max-spend ${maxSpend} USD: ${newJobs} new clip(s) at about ${per.toFixed(3)} USD each would exceed it; nothing was submitted`);

  for (const [i, s] of cfg.scenes.entries()) {
    for (let t = 1; t <= takes; t++) {
      if (jobs.jobs.some((j) => j.scene === s.name && j.take === t)) continue;
      const spec = { scene: s.name, take: t, index: i, prompt: scenePrompt(s, cfg), raw: s.prompt, aspect, seconds, resolution: '1080p', model: cfg.video.model, width: cfg.width, height: cfg.height, fps: cfg.fps };
      const job = await vp.submit(spec);
      jobs.jobs.push({ scene: s.name, key: s.key, take: t, status: 'submitted', submitted: new Date().toISOString(), ...job });
      writeJson(jobsFile, jobs);
      log.info(`${s.name} take ${t}: submitted (${job.id})`);
    }
  }
  for (let round = 0; jobs.jobs.some((j) => !['downloaded', 'failed'].includes(j.status)); round++) {
    for (const j of jobs.jobs.filter((x) => !['downloaded', 'failed'].includes(x.status))) {
      const st = await vp.poll(j);
      if (st.status === 'done') {
        Object.assign(j, { videoUrl: st.videoUrl, videoData: undefined });
        const file = path.join(dest, name === 'mock' ? `${j.scene}.mp4` : `${j.scene}_${name}_t${j.take}.mp4`);
        await vp.download({ ...j, videoData: st.videoData }, file);
        Object.assign(j, { status: 'downloaded', file: path.relative(filmDir, file).replace(/\\/g, '/'), finished: new Date().toISOString() });
        log.info(`${j.scene} take ${j.take}: downloaded to ${j.file}`);
      } else if (st.status === 'failed') {
        Object.assign(j, { status: 'failed', error: st.error });
        log.assume('video generation', `${j.scene} take ${j.take} failed (${st.error}); not retried automatically`);
      } else j.status = st.status;
      writeJson(jobsFile, jobs);
    }
    if (jobs.jobs.some((j) => !['downloaded', 'failed'].includes(j.status))) await sleep(Math.min(30000, pollMs * 1.5 ** Math.min(round, 4)));
  }
  return jobs;
}
