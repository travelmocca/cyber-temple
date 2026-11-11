import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
const directory = new URL('../../RECON/mirror/comparisons/safari/', import.meta.url);
await mkdir(directory, { recursive: true });
const processHandle = spawn('/usr/bin/safaridriver', ['--port', '4192'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
processHandle.stderr.on('data', (d) => (logs += d));
processHandle.stdout.on('data', (d) => (logs += d));
const base = 'http://127.0.0.1:4192';
let id,
  result = { browser: 'actual installed Safari', status: 'unverified' };
const call = async (path, method = 'GET', body) => {
  const r = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(45000),
  });
  const data = await r.json();
  if (data.value?.error) throw Error(data.value.message);
  return data.value;
};
try {
  await new Promise((r) => setTimeout(r, 1500));
  const session = await call('/session', 'POST', {
    capabilities: { alwaysMatch: { browserName: 'safari' } },
  });
  id = session.sessionId;
  result.capabilities = session.capabilities;
  await call('/session/' + id + '/url', 'POST', { url: 'http://127.0.0.1:4191/?room=maru-16' });
  let state;
  for (let i = 0; i < 60; i++) {
    state = await call('/session/' + id + '/execute/sync', 'POST', {
      script:
        "return {ready:!!document.querySelector('#game-loading.is-loaded'),canvas:document.querySelector('canvas[data-engine]')?.dataset.position,text:document.body.innerText}",
      args: [],
    });
    if (state.canvas) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  result.state = state;
  result.status = state?.canvas ? 'local-entry-passed' : 'failed';
  const shot = await call('/session/' + id + '/screenshot');
  await writeFile(new URL('entry.png', directory), Buffer.from(shot, 'base64'));
} catch (e) {
  result.reason = e.message;
} finally {
  if (id) await call('/session/' + id, 'DELETE').catch(() => {});
  processHandle.kill();
  result.driverLog = logs;
  await writeFile(new URL('result.json', directory), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
