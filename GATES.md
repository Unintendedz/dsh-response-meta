# Verification gates: dsh-response-meta 0.2.1

Run every runtime/browser check in a fresh temporary DSH_HOME, an explicitly
named audit-/test-/fix- profile, a dedicated loopback port and a synthetic
workspace. Use synthetic provider/session data and a fresh browser context.
Record the home, profile, port and PID before interaction, then stop the
verified process and delete only its temporary directory. Never use an existing
profile, port 33080, original conversation data or copied credentials as a fixture.

## Automated package and behavior checks

- Package declares the bundle patch, Web client and client export.
- Host registers the rc2 projection contract (stateSchema and wire.viewSchema).
- request/header folds into the correct turn; header-less turns inherit the
  previous model; out-of-turn headers are excluded.
- Browser registers completed actions and live/interrupted nodes, retains
  the final summary, and hides only the duplicate native assistant timestamp.
- Installer requires an explicit home/profile and uses that profile's store.
- Live-check regressions reject projection-only, aborted/error partial replies,
  missing visible answers, wrong answers and a model belonging to another turn.
- The live-check transport is entirely synthetic in the unit suite, and the
  installer tests replace command boundaries so no existing profile is used.

Run:

```sh
npm test
npm pack --dry-run --json
git diff --check
```

## Actual isolated DSH request

Start an isolated Web instance with this plugin and a local synthetic model
provider. Preserve DSH_HOME and DSH_PROFILE from its launcher and write the
matching identity JSON described in both READMEs. Then run:

```sh
DSH_TEST_IDENTITY=/path/to/test-instance.json \
  node tests/live-e2e.mjs http://127.0.0.1:33880
```

Passing requires all three facts for the same newly created turn: a completed
turn/end reason, final visible text exactly OK, and a nonempty model projection.
An early model projection alone is never evidence of successful completion.

The 0.2.1 isolated validation used DSH 0.1.1-rc.2 and a local deterministic
SSE provider, with no external model or user credentials. The actual request
completed with OK and a deepseek-v4-flash model record. Test logs and process
identity are retained in the release verification report, outside the package.

## Browser checks

Use the isolated instance only. Verify the live summary, completed summary,
manual interruption, the preserved user timestamp, and the native assistant
clock's absence. The scripts tests/browser-interrupt.js,
tests/browser-interrupt-mid.js and tests/browser-layout.js are helpers for
synthetic conversations in that browser, not permission to attach to an
existing user browser or profile.

Existing 0.2.0 browser layout/streaming observations are historical evidence;
they are not a substitute for current checks. In particular, the former
live-e2e success message was insufficient and must not be used to certify
a completed model turn.
