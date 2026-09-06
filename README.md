# dsh-response-meta

English | [中文](./README.zh.md)

A DSH Web plugin that adds one live runtime summary to every model reply:
**model, reasoning extent, tokens per second, timestamp, total runtime, and
time to first token (TTFT)**. The summary appears while the model is responding
and updates as chunks arrive; it does not wait for the reply to finish.

The plugin hides the duplicate native timing group that normally appears on
hover in the same assistant action row, while preserving timestamps on user
messages. Manually interrupted replies, including replies stopped during
reasoning, receive an inline summary as well.

Example in a Chinese UI (11 px muted text):

```text
# While streaming, inline in the message stream
deepseek-v4-pro · 思考 1.5k 字 · ~42 tok/s
# Completed reply, below the message actions
deepseek-v4-pro · 思考 15 tok · 46 tok/s · 14:16 · 用时 2分24秒 · 首 token 2.1秒
# Interrupted during reasoning, inline in the message stream
deepseek-v4-pro · 思考 1.5k 字
```

- **Model** comes from the turn's `request/header` session event. Later turns
  without a new header inherit the most recent known model.
- **Live updates** appear as soon as model or streamed-token data is available.
  Reasoning extent and estimated throughput refresh at animation-frame cadence;
  final provider usage replaces the estimate when the reply completes.
- **Reasoning extent** prefers provider-reported reasoning tokens and falls
  back to the reasoning text length.
- **Tokens/s** is output tokens divided by decode time, from first token to
  message completion, matching DSH's native timing semantics.
- **Timestamp** shows `HH:mm` for today's replies and includes the date for
  older replies.
- **Total runtime** spans the whole turn; **TTFT** spans the current step from
  start to its first token.
- Interrupted replies usually have no usage record, so the plugin shows the
  model and streamed reasoning extent. Real usage is retained when a
  finalization race provides it.
- Missing fields are omitted individually; nothing is rendered when all fields
  are unavailable.

## Install

```sh
dsh plugin --profile web add github:Unintendedz/dsh-response-meta#v0.2.1
```

Restart the running DSH Web service after installation. Plugins are loaded
when the service starts.

## Local development

The local installer requires an explicit `DSH_HOME` and `--profile` (or
`DSH_PROFILE`). It never defaults to an existing home or the `web` profile.
It removes and re-adds the local `file:` snapshot, reusing the selected profile's
pnpm `storeDir`, including paths containing spaces. Restart only that profile's
Web instance afterward.

Use a fresh temporary home and synthetic workspace for every test:

```sh
export DSH_HOME="$(mktemp -d "${TMPDIR:-/tmp}/dsh-response-meta.XXXXXX")"
export DSH_PROFILE=audit-response-meta
mkdir -p "$DSH_HOME/workspace"
./scripts/install.sh --profile "$DSH_PROFILE"
```

Use a dedicated free loopback port and synthetic provider/session data. Never
copy an existing profile's settings, credentials, sessions, caches, or browser
state. Record the home, profile, port, workspace and process ID before any Web
interaction; stop the verified test process and remove only its temporary
directory afterward.

## Uninstall

```sh
dsh plugin --profile web remove dsh-response-meta
```

## How it works

- **Host** (`lib/index.js`): registers a dependency-free projection unit on
  `ctx.sessionProjections`. It folds session events, tracks the active
  turn/step, records the last in-turn `request/header` model in `byTurn`, and
  inherits the previous model for header-less turns. Headers outside turns,
  such as title or compaction requests, are ignored. Projection updates reach
  the browser through DSH's existing session-projection channel. The plugin
  implements the rc2 projection contract (`stateSchema` + `wire.viewSchema`).
- **Browser** (`lib/client.js`):
  - Running replies publish one incremental `dsh-response-meta-aborted`
    conversation node from `step/start`; streamed chunks refresh it at most once
    per animation frame. A visible finalized message hides that stable live node
    and hands off to the exact completed summary. If the step is interrupted,
    failed, or aborted, the same node remains visible.
  - Completed replies register in `conversation.chat.assistant-actions`. The
    component reads usage, step timing, turn timing, reasoning content, and the
    per-turn model projection for the exact `messageId`. A scoped structural
    selector hides only the native assistant timing group.
  - The incremental node renders through a keyed `conversation.chat.node`
    entry. This also covers reasoning-only steps that never produced
    `turn/end`.
  - Actions remain on the first row; the complete summary owns a responsive
    second row. Narrow screens wrap without truncation or horizontal overflow.

## Verify

```sh
npm test
DSH_TEST_IDENTITY=/path/to/test-instance.json \
  node tests/live-e2e.mjs http://127.0.0.1:33880
```

The live command also requires `DSH_HOME` and `DSH_PROFILE` from the isolated
launcher. Its identity JSON must contain `dshHome`, `profile`, `host` (exactly
`127.0.0.1`), numeric `port`, the running server's numeric `pid`, `workspace`,
and `synthetic: true`, all matching that instance. Both home and workspace must
be beneath the operating system's temporary directory, and the profile must
start with `audit-`, `test-`, or `fix-`. The live harness rejects port 33080.
Configure a local synthetic model provider in this new profile before running
it; no credentials or settings from an existing profile are needed.

The check creates a synthetic session and passes only when the same turn ends
with reason `completed`, the final visible answer is exactly `OK`, and that
turn has a nonempty model projection. An early projection, interrupted or
failed partial reply, wrong answer, or timeout fails the check. The browser
scripts in `tests/` cover live/interruption behavior and completed-row layout;
run them only in the same isolated instance and a fresh browser context.
