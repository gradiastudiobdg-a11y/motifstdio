import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { FlowQuotedMcp } from '../automation/flow-quoted-mcp.mjs';
const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filename = path.join(studioDir, '.studio/first-flow-test-prep/quoted-mcp.json');
const mcp = new FlowQuotedMcp(studioDir);
let record = JSON.parse(await readFile(filename, 'utf8').catch(() => '{}'));
try {
  if (!record.projectId) {
    const result = await mcp.call('flow_create_project', { title: 'MOTIF — Mulai Dua Menit — 30s 9x16' });
    if (!result.id) throw Error('Project identity missing.');
    record = { projectId: result.id, jobId: '7cb9d178-b3ff-4ef4-a558-ce560151039c' };
    await writeFile(filename, JSON.stringify(record, null, 2));
  }
  const result = await mcp.call('flow_generate_video', { project_id: record.projectId, prompt: 'A single vertical cinematic shot of a closed book on a wooden desk beside a phone, soft warm window light, olive wall, no text, no speech.', model_key: 'abra_t2v_10s', family: 'omni', duration_sec: 10, resolution: '720p', aspect: '9:16', count: 1, max_credits: 15, dry_run: true }, 90000);
  record.preflight = result;
  await writeFile(filename, JSON.stringify(record, null, 2));
  console.log(JSON.stringify({ dryRun: result.dryRun, quotedCredits: result.quotedCredits, model: result.model, submitted: false }));
} catch(error) { console.log(JSON.stringify({ code: error.code, detail: error.message, submitted: false })); process.exitCode = 1; }
finally { await mcp.close(); }
