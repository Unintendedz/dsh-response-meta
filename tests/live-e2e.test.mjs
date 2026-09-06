import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./live-e2e.mjs', import.meta.url));
const event = (type, data) => ({ event: { type, data } });
const start = event('turn/start', { turn: 0 });
const assistant = (text = 'OK') => event('assistant/message', {
  turn: 0, step: 0, message: { content: [{ type: 'text', text }] },
});
const end = (kind = 'completed') => event('turn/end', { turn: 0, reason: { kind } });
const history = (events, byTurn = { 0: { model: 'synthetic-model' } }) => ({
  events, projections: { values: { 'dsh-response-meta': { byTurn } } },
});

async function run(snapshots, envOverrides = {}) {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-response-check-'));
  try {
    const dshHome = join(temp, 'dsh-home');
    const workspace = join(temp, 'workspace');
    const profile = 'audit-response-meta';
    await mkdir(join(dshHome, 'profiles', profile), { recursive: true });
    await mkdir(workspace);
    const identity = join(temp, 'identity.json');
    await writeFile(identity, JSON.stringify({ dshHome, workspace, profile,
      pid: process.pid, host: '127.0.0.1', port: 33881, synthetic: true }));
    const callsFile = join(temp, 'calls.jsonl');
    const preload = join(temp, 'synthetic-transport.mjs');
    await writeFile(preload, `
      import { appendFileSync } from 'node:fs';
      const snapshots = JSON.parse(process.env.DSH_TEST_SNAPSHOTS);
      let poll = 0;
      globalThis.fetch = async (url, init) => {
        const { method, payload } = JSON.parse(init.body);
        appendFileSync(process.env.DSH_TEST_CALLS, JSON.stringify({ method, payload }) + '\\n');
        const value = method === 'session.create' ? { sessionId: 'synthetic-session' }
          : method === 'session.prompt' ? { messageId: 'synthetic-message' }
          : snapshots[Math.min(poll++, snapshots.length - 1)];
        return { status: 200, json: async () => ({ result: { ok: true, value } }) };
      };
      const realTimeout = globalThis.setTimeout;
      globalThis.setTimeout = (fn) => realTimeout(fn, 0);
    `);
    const result = spawnSync(process.execPath, ['--import', preload, script, 'http://127.0.0.1:33881'], {
      encoding: 'utf8', timeout: 10000, cwd: workspace,
      env: { ...process.env, DSH_HOME: dshHome, DSH_PROFILE: profile,
        DSH_TEST_IDENTITY: identity, DSH_TEST_SNAPSHOTS: JSON.stringify(snapshots),
        DSH_TEST_CALLS: callsFile, ...envOverrides },
    });
    const calls = (await readFile(callsFile, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(JSON.parse);
    return { ...result, calls, workspace: await realpath(workspace) };
  } finally { await rm(temp, { recursive: true, force: true }); }
}

for (const [name, snapshot] of [
  ['projection arrives before any assistant or completion', history([])],
  ['completed turn has no assistant text', history([start, end()])],
  ['aborted turn includes a partial OK', history([start, assistant(), end('aborted')])],
  ['failed turn includes a partial OK', history([start, assistant(), end('error')])],
  ['completed answer violates the exact prompt', history([start, assistant('not OK'), end()])],
  ['only another turn has a model', history([start, assistant(), end()], { 1: { model: 'other' } })],
]) {
  test(`live check rejects when ${name}`, async () => {
    const result = await run([snapshot]);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout, /live OK/);
  });
}

test('live check waits for completed OK and its model, using the synthetic workspace', async () => {
  const result = await run([history([start]), history([start, assistant()]), history([start, assistant(), end()])]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.filter(call => call.method === 'session.history').length, 3);
  assert.equal(result.calls[0].payload.cwd, result.workspace);
  assert.match(result.stdout, /live OK/);
});

test('live check refuses a missing isolation identity before making any RPC', async () => {
  const result = await run([history([start, assistant(), end()])], { DSH_TEST_IDENTITY: '' });
  assert.notEqual(result.status, 0);
  assert.equal(result.calls.length, 0);
});
