// Host-fold unit test for the `dsh-response-meta` projection unit.
// Runs the pure fold over synthetic committed events and asserts the
// per-turn model records, projection-contract validity, and same-reference
// behavior. Zero dependencies: the unit hand-rolls its state/wire validators.
import { responseMetaUnit } from "../lib/index.js";

function assert(condition, message) {
	if (!condition) {
		console.error(`FAIL: ${message}`);
		process.exit(1);
	}
}

const unit = responseMetaUnit;

// ── fold over a synthetic turn ─────────────────────────────────────────────
let state = unit.init();
let last = state;
const events = [
	{ type: "turn/start", data: { turn: 0 } },
	{ type: "step/start", data: { turn: 0, step: 0 } },
	{ type: "request/header", data: { header: { config: { model: "deepseek-v4-flash", reasoningEffort: "medium" } }, reason: "initial" } },
	{ type: "assistant/chunk", data: { turn: 0, step: 0, chunk: { type: "text-delta", index: 0, text: "hi" } } },
	{ type: "assistant/message", data: { turn: 0, step: 0, message: { content: [] }, usage: { outputTokens: 12, reasoningTokens: 5 } } },
	{ type: "step/end", data: { turn: 0, step: 0 } },
	{ type: "request/header", data: { header: { config: { model: "deepseek-v4-pro" } }, reason: "change" } },
	{ type: "turn/end", data: { turn: 0 } }
];

for (const event of events) state = unit.apply(state, event);
last = state;

// Last header inside the turn wins.
assert(state.byTurn["0"].model === "deepseek-v4-pro", `model should be the last header, got ${JSON.stringify(state.byTurn["0"])}`);

// State and view parse against the rc2 projection contract.
unit.stateSchema.parse(state);
const view = unit.wire.view(state);
unit.wire.viewSchema.parse(view);
assert(Object.keys(view.byTurn).length === 1, `expected one turn record, got ${JSON.stringify(view.byTurn)}`);

// Unrelated events keep the same state reference (Object.is) — the
// projection contract's zero-work signal.
const unrelated = { type: "assistant/message", data: { turn: 0, step: 0, message: { content: [] }, usage: { outputTokens: 3 } } };
assert(Object.is(unit.apply(last, unrelated), last), "unrelated event must return the same state reference");

// Header outside any open turn is ignored.
let detached = unit.init();
detached = unit.apply(detached, { type: "request/header", data: { header: { config: { model: "stray-model" } }, reason: "initial" } });
assert(Object.keys(unit.wire.view(detached).byTurn).length === 0, "header outside a turn must not create a record");

// A turn whose header is missing its model field records null.
let nullModel = unit.init();
nullModel = unit.apply(nullModel, { type: "turn/start", data: { turn: 1 } });
nullModel = unit.apply(nullModel, { type: "request/header", data: { header: {}, reason: "initial" } });
nullModel = unit.apply(nullModel, { type: "turn/end", data: { turn: 1 } });
assert(nullModel.byTurn["1"].model === null, `missing config.model must record null, got ${JSON.stringify(nullModel.byTurn["1"])}`);

// Two turns keep independent records.
let two = unit.init();
two = unit.apply(two, { type: "turn/start", data: { turn: 0 } });
two = unit.apply(two, { type: "step/start", data: { turn: 0, step: 0 } });
two = unit.apply(two, { type: "request/header", data: { header: { config: { model: "m-a" } }, reason: "initial" } });
two = unit.apply(two, { type: "turn/end", data: { turn: 0 } });
two = unit.apply(two, { type: "turn/start", data: { turn: 1 } });
two = unit.apply(two, { type: "step/start", data: { turn: 1, step: 0 } });
two = unit.apply(two, { type: "request/header", data: { header: { config: { model: "m-b" } }, reason: "change" } });
assert(two.byTurn["0"].model === "m-a" && two.byTurn["1"].model === "m-b", `per-turn records must stay independent, got ${JSON.stringify(two.byTurn)}`);

// A turn with NO header event (unchanged config logs none) inherits the
// last known model — the real multi-turn case that lost its model before.
let inherited = unit.init();
inherited = unit.apply(inherited, { type: "turn/start", data: { turn: 0 } });
inherited = unit.apply(inherited, { type: "step/start", data: { turn: 0, step: 0 } });
inherited = unit.apply(inherited, { type: "request/header", data: { header: { config: { model: "m-a" } }, reason: "initial" } });
inherited = unit.apply(inherited, { type: "turn/end", data: { turn: 0 } });
inherited = unit.apply(inherited, { type: "turn/start", data: { turn: 1 } });
inherited = unit.apply(inherited, { type: "step/start", data: { turn: 1, step: 0 } });
inherited = unit.apply(inherited, { type: "step/end", data: { turn: 1, step: 0 } });
inherited = unit.apply(inherited, { type: "turn/end", data: { turn: 1 } });
assert(inherited.byTurn["0"].model === "m-a" && inherited.byTurn["1"].model === "m-a", `header-less turn must inherit the previous model, got ${JSON.stringify(inherited.byTurn)}`);
// …but an in-turn header change still replaces the inherited value.
inherited = unit.apply(inherited, { type: "turn/start", data: { turn: 2 } });
inherited = unit.apply(inherited, { type: "step/start", data: { turn: 2, step: 0 } });
inherited = unit.apply(inherited, { type: "request/header", data: { header: { config: { model: "m-b" } }, reason: "change" } });
assert(inherited.byTurn["2"].model === "m-b", `in-turn header must replace the inherited model, got ${JSON.stringify(inherited.byTurn["2"])}`);

// Headers outside any turn never update the inheritance baseline.
let stray = unit.init();
stray = unit.apply(stray, { type: "request/header", data: { header: { config: { model: "stray-model" } }, reason: "initial" } });
stray = unit.apply(stray, { type: "turn/start", data: { turn: 0 } });
assert(stray.byTurn["0"].model === null, `out-of-turn header must not seed inheritance, got ${JSON.stringify(stray.byTurn["0"])}`);

// The fold-semantics change invalidates persisted v1 caches.
assert(unit.stateVersion === 2, `stateVersion must be 2, got ${unit.stateVersion}`);

// The wire schema rejects foreign fields (strictness holds at the boundary).
try {
	unit.wire.viewSchema.parse({ byTurn: { "0": { model: "m", extra: true } } });
	assert(false, "wire schema strictness probe should have thrown");
} catch {
	// expected
}

// The wire schema rejects non-numeric turn keys and wrong model types.
try {
	unit.wire.viewSchema.parse({ byTurn: { abc: { model: "m" } } });
	assert(false, "non-numeric turn key should have thrown");
} catch {
	// expected
}
try {
	unit.wire.viewSchema.parse({ byTurn: { "0": { model: 42 } } });
	assert(false, "non-string model should have thrown");
} catch {
	// expected
}
unit.wire.viewSchema.parse({ byTurn: { "0": { model: null } } });
unit.wire.viewSchema.parse({ byTurn: {} });

console.log("fold OK");
