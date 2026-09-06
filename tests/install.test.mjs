import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const installer = fileURLToPath(new URL('../scripts/install.sh', import.meta.url));
async function install(args, overrides = {}) {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-meta-install-'));
  try {
    const dshHome = join(temp, 'dsh-home');
    const bin = join(temp, 'bin');
    const profile = 'audit-install';
    const store = join(temp, 'synthetic store');
    const modules = join(dshHome, 'profiles', profile, 'node_modules');
    await mkdir(modules, { recursive: true });
    await mkdir(bin);
    await writeFile(join(modules, '.modules.yaml'), 'storeDir: ' + store + '\n');
    const calls = join(temp, 'calls.jsonl');
    await writeFile(join(bin, 'dsh'), `#!/usr/bin/env node
      require('node:fs').appendFileSync(process.env.DSH_TEST_CALLS, JSON.stringify(process.argv.slice(2)) + '\\n');
    `, { mode: 0o755 });
    await writeFile(join(bin, 'pnpm'), '#!/bin/sh\nprintf "%s\\n" "$DSH_TEST_FALLBACK_STORE"\n', { mode: 0o755 });
    // Guard the real awk boundary: even a regressed installer cannot read an
    // existing profile. The parser itself runs only on synthetic fixtures.
    await writeFile(join(bin, 'awk'), '#!/bin/sh\n[ -n "$DSH_HOME" ] || exit 0\nfor arg do last="$arg"; done\ncase "$last" in "$DSH_HOME"/*) exec /usr/bin/awk "$@" ;; *) exit 0 ;; esac\n', { mode: 0o755 });
    const result = spawnSync('/bin/sh', [installer, ...args], { encoding: 'utf8', cwd: temp,
      env: { ...process.env, PATH: bin + ':' + process.env.PATH, DSH_HOME: dshHome,
        DSH_PROFILE: '', DSH_TEST_CALLS: calls, DSH_TEST_FALLBACK_STORE: join(temp, 'fallback'), ...overrides },
    });
    const invocations = (await readFile(calls, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(JSON.parse);
    return { ...result, invocations, store };
  } finally { await rm(temp, { recursive: true, force: true }); }
}

test('installer requires explicit DSH_HOME before invoking package operations', async () => {
  const result = await install(['--profile', 'audit-install'], { DSH_HOME: '' });
  assert.notEqual(result.status, 0);
  assert.equal(result.invocations.length, 0);
});
test('installer requires an explicit profile before invoking package operations', async () => {
  const result = await install([]);
  assert.notEqual(result.status, 0);
  assert.equal(result.invocations.length, 0);
});
test('installer rejects profile path traversal before invoking package operations', async () => {
  const result = await install(['--profile', '../web']);
  assert.notEqual(result.status, 0);
  assert.equal(result.invocations.length, 0);
});
test('installer uses the selected home, profile, and full existing store path', async () => {
  const result = await install(['--profile', 'audit-install']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.invocations.length, 2);
  for (const args of result.invocations) {
    assert.deepEqual(args.slice(0, 3), ['plugin', '--profile', 'audit-install']);
    assert.equal(args.at(-1), result.store);
  }
  assert.equal(result.invocations[0][3], 'remove');
  assert.equal(result.invocations[1][3], 'add');
  assert.match(result.invocations[1][4], /^file:/);
});
