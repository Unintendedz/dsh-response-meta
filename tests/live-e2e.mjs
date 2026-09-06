// Run only against a freshly created, synthetic DSH Web instance.
import { readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, sep } from 'node:path';

const BASE = process.argv[2];
const identityPath = process.env.DSH_TEST_IDENTITY;
if (!BASE || !identityPath || !process.env.DSH_HOME || !process.env.DSH_PROFILE) {
  throw new Error('Set DSH_HOME, DSH_PROFILE and DSH_TEST_IDENTITY, then pass the isolated loopback URL');
}
const identity = JSON.parse(await readFile(identityPath, 'utf8'));
const url = new URL(BASE);
if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port
  || url.port === '33080' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
  || identity.host !== url.hostname || identity.port !== Number(url.port)
  || identity.synthetic !== true || !Number.isInteger(identity.pid) || identity.pid <= 0
  || identity.profile !== process.env.DSH_PROFILE || !/^(audit|test|fix)-[a-zA-Z0-9_-]+$/.test(identity.profile)) {
  throw new Error('Target does not match an explicitly named isolated test instance');
}
const [temporaryRoot, dshHome, workspace, configuredHome] = await Promise.all([
  realpath(tmpdir()), realpath(identity.dshHome), realpath(identity.workspace), realpath(process.env.DSH_HOME),
]);
const inside = (parent, child) => {
  const path = relative(parent, child);
  return path !== '' && path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
};
if (dshHome !== configuredHome || !inside(temporaryRoot, dshHome) || !inside(temporaryRoot, workspace)) {
  throw new Error('DSH home and synthetic workspace must be dedicated temporary directories');
}
process.kill(identity.pid, 0);

async function rpc(method, payload) {
  const response = await fetch(url.origin + '/api/' + method, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'r-' + Math.random(), method, payload }),
  });
  if (response.status !== 200) throw new Error(method + ': HTTP ' + response.status);
  const envelope = await response.json();
  if (envelope.result?.ok !== true) throw new Error(method + ': request failed');
  return envelope.result.value;
}

const { sessionId } = await rpc('session.create', { cwd: workspace });
if (typeof sessionId !== 'string' || !sessionId) throw new Error('session.create returned no session ID');
console.log('created synthetic session ' + sessionId);
await rpc('session.prompt', { sessionId, mode: 'queue', content: [{ type: 'text', text: 'Reply with exactly: OK' }] });

let completedPolls = 0;
let success = false;
for (let attempt = 0; attempt < 60; attempt++) {
  await new Promise(resolve => setTimeout(resolve, 2000));
  const history = await rpc('session.history', { sessionId });
  const events = (history.events ?? []).map(entry => entry.event).filter(Boolean);
  const turn = events.find(event => event.type === 'turn/start')?.data?.turn;
  const end = events.find(event => event.type === 'turn/end' && event.data?.turn === turn);
  if (!Number.isInteger(turn) || !end) continue;
  if (end.data.reason?.kind !== 'completed') throw new Error('turn ' + turn + ' did not complete: ' + (end.data.reason?.kind ?? 'unknown'));
  const reply = events.filter(event => event.type === 'assistant/message' && event.data?.turn === turn).at(-1);
  const text = reply?.data?.message?.content?.filter(block => block.type === 'text').map(block => block.text).join('');
  if (reply?.data?.interrupted || text?.trim() !== 'OK') throw new Error('completed turn did not produce the exact visible answer OK');
  const record = history.projections?.values?.['dsh-response-meta']?.byTurn?.[turn];
  if (typeof record?.model === 'string' && record.model.trim()) {
    console.log('completed turn ' + turn + ': OK; model=' + record.model);
    success = true;
    break;
  }
  if (++completedPolls >= 5) throw new Error('completed turn has no nonempty model projection after 5 polls');
}
if (!success) throw new Error('timed out waiting for completed OK and its model projection');
console.log('live OK');
