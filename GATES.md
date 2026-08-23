# Gates: dsh-response-meta DSH plugin

Goal: a DSH web plugin that, after each completed model output, shows one
always-visible line with model, reasoning extent, toks/s, timestamp, total run,
and TTFT; removes the duplicate assistant hover clock without touching user
timestamps; and keeps manually interrupted outputs covered.

## G1 — Package shape
- [x] G1: package.json declares dsh.bundle.patch: ./cordis.patch.yml
  EVIDENCE: package.json: `"patch": "./cordis.patch.yml"` (read from file)
- [x] G1b: package.json declares dsh.client.platform: web and exports["./client"] → lib/client.js
  EVIDENCE: package.json: `"platform": "web"`, `"./client": "./lib/client.js"` (read from file)

## G2 — Host half
- [x] G2: lib/index.js registers a projection unit on ctx.sessionProjections (rc2 contract: stateSchema + wire.viewSchema)
  EVIDENCE: lib/index.js apply(): `ctx.sessionProjections.register(unit)`; unit carries stateSchema and wire.viewSchema; zero runtime deps
- [x] G2b: the unit folds request/header + boundary events into per-turn model records, with inheritance for header-less turns; plain-JSON state; stateVersion 2
  CHECK: node tests/host-fold.mjs
  EXPECT: fold OK

## G3 — Client half
- [x] G3: lib/client.js is a window.__ModuleLoader__.load bundle requiring only react and react/jsx-runtime
  EVIDENCE: bundle factory requires exactly `react/jsx-runtime` and `react`
- [x] G3b: it registers into conversation.chat.assistant-actions (list, id dsh-response-meta, order 100) and a keyed chat.node entry for aborted steps
  EVIDENCE: client-harness asserts both registrations; browser boot shows zero console errors
- [x] G3c: the completed line shows model + reasoning extent + toks/s + timestamp + run duration + TTFT, and renders nothing when no data exists
  CHECK: node tests/client-harness.mjs
  EXPECT: client bundle OK
- [x] G3d: the completed line has a distinct semantic marker; only the sibling native assistant clock is hidden, and the summary owns the row below the native action buttons
  EVIDENCE: client-harness asserts the scoped selector and marker; browser-layout asserts the second-row geometry; live DOM reports native clock `display: none` and the user clock remains present

## G4 — Install and live artifact
- [x] G4: cordis.patch.yml inserts one row naming the package
  EVIDENCE: cordis.patch.yml: `- id: dsh-response-meta` / `name: dsh-response-meta`
- [x] G4b: plugin installed into the web profile and listed in its bundles
  CHECK: node -e "process.exit(require('fs').readFileSync(process.env.HOME+'/.dsh/profiles/web/package.json','utf8').includes('dsh-response-meta')?0:1)" && echo listed
  EXPECT: listed
- [x] G4c: composed web tree contains the plugin row
  CHECK: dsh --profile web --dump-config | grep -c dsh-response-meta
  EXPECT: /^[1-9]/

## G5 — Surface feel
- [x] G5: small font (≤12px), muted color, non-interactive, always visible, responsive without horizontal overflow
  EVIDENCE: live browser computed style: fontSize 11px, muted theme color, pointerEvents none; at 1280px and 820px the summary is a 16px-high second row inside a 50px action area; 375px wraps to 32px without horizontal overflow

## G6 — No left-over stubs
- [x] G6: no TODO/FIXME in lib/*.js
  CHECK: grep -rn "TODO\|FIXME" lib/ | wc -l
  EXPECT: 0

## G7 — End-to-end completed turns
- [x] G7: real model call serves the projection with the actual model name, and the browser renders the readout after the answer
  EVIDENCE: live browser rendered `deepseek-v4-pro · 思考 241 tok · 74 tok/s` for a completed turn; earlier live-e2e printed `dsh-response-meta projection: {"byTurn":{"1":{"model":"deepseek-v4-pro"}}}` / `live OK`

## G8 — End-to-end interrupted turns
- [x] G8a: stop during thinking (before any streamed token, no turn/end in the log) still shows the readout
  EVIDENCE: live browser rendered `deepseek-v4-pro | aborted` (data-dsh-response-meta="aborted")
- [x] G8b: stop that races finalization (reasoning-only assistant/message + aborted turn/end) still shows the readout
  EVIDENCE: live browser rendered `deepseek-v4-pro · 思考 1.5k 字 | aborted` on the raced session after reload
- [x] G8c: a header-less second turn inherits the previous turn's model
  EVIDENCE: live browser rendered `deepseek-v4-pro · 思考 241 tok · 74 tok/s` for turn 2 of a session whose log contains only turn 1's request/header
- [x] G8d: interrupted outputs carry a toks/s reading — real provider usage when the finalization race reports one, a `~` estimate from streamed chars otherwise; zero-value segments are omitted
  EVIDENCE: live browser rendered `deepseek-v4-pro · 思考 1.3k 字 · ~75 tok/s | aborted` (estimated) and `deepseek-v4-pro · 45 tok/s | true` for a completed reply whose reasoningTokens were 0 (segment omitted)

## G9 — Unified completed readout
- [x] G9a: the installed profile renders the real completed-turn line with all available facts
  EVIDENCE: live browser rendered `deepseek-v4-flash-0731-abliterated · 思考 126 字 · 40 tok/s · 14:00 · 用时 3秒 · 首 token 0.5秒`
- [x] G9b: the original assistant hover clock is absent while the user's own timestamp survives
  EVIDENCE: same live row's native clock has computed `display:none`; DOM still contains one visible user-side `14:00` clock
- [x] G9c: create-branch precedes the per-message branch switcher, which ends the first action row
  CHECK: tests/browser-layout.js
  EVIDENCE: live geometry at 1280px and 820px reports `switcherAfterCreateBranch: true`
