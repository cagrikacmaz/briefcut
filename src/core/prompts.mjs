// `briefcut prompts`: the scene prompts (flow_brief.md) a video tool or a browser agent needs,
// from the brief's `## Scenes` (one `### NAME` per scene) and `## Style` / `## Shared style`.
import fs from 'node:fs';
import path from 'node:path';

export function scenePrompt(scene, cfg) {
  const body = scene.prompt.replace(/^[-*\s]*Mock events:.*$/gim, '').trim();
  return cfg.style ? `${body}\n\n${cfg.style}` : body;
}

export function writeFlowBrief(cfg, filmDir, { takes = 2, seconds = 8 } = {}) {
  if (!cfg.scenes.length) throw new Error('the brief has no "## Scenes" section with one "### NAME" subsection per scene');
  const aspect = cfg.height > cfg.width ? '9:16' : '16:9';
  const L = [
    `# Scene prompts: ${cfg.title}`,
    '',
    `${cfg.scenes.length} scenes, ${aspect}, ${seconds} s each, ${takes} takes per scene, one video model for all of them${cfg.video.model ? ` (${cfg.video.model})` : ''}. Paste each prompt as written. Download every take at full resolution (1080p or native, never a preview).`,
    '',
  ];
  if (cfg.style) L.push('## Shared style (already appended to every prompt below)', '', cfg.style, '');
  L.push('## Scenes', '');
  for (const s of cfg.scenes) L.push(`### ${s.name}`, '', '```', scenePrompt(s, cfg), '```', '');
  L.push('## Takes', '', `Best take per scene goes to \`clips/<SCENE>.mp4\`, the others to \`clips/_rejected/\`; reasons in \`clips/NOTES.md\`. Native audio is discarded by the pipeline.`, '');
  const file = path.join(filmDir, 'flow_brief.md');
  fs.writeFileSync(file, L.join('\n'));
  return file;
}
