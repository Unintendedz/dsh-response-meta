// dsh-response-meta — host half.
// A tiny session-projection unit: tracks which model produced each turn's
// output by folding request/header events into per-turn records. The browser
// half renders it as a small line under each assistant message.
//
// The projection contract requires state and wire schemas with `parse`
// methods; this plugin hand-rolls those validators so it carries zero
// runtime dependencies.

// ── wire validator (strict, mirroring zod's `.strict()` at the boundary) ───
function fail(value, path) {
	throw new Error(`dsh-response-meta projection: invalid ${path}: ${JSON.stringify(value)}`);
}

function parseView(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) fail(value, "root");
	for (const key of Object.keys(value)) {
		if (key !== "byTurn") fail(value, `root key ${JSON.stringify(key)}`);
	}
	const byTurn = value.byTurn;
	if (typeof byTurn !== "object" || byTurn === null || Array.isArray(byTurn)) fail(byTurn, "byTurn");
	for (const [turnKey, record] of Object.entries(byTurn)) {
		if (!/^\d+$/.test(turnKey)) fail(turnKey, "turn key");
		if (typeof record !== "object" || record === null || Array.isArray(record)) fail(record, `byTurn.${turnKey}`);
		for (const key of Object.keys(record)) {
			if (key !== "model") fail(record, `byTurn.${turnKey} key ${JSON.stringify(key)}`);
		}
		if (record.model !== null && typeof record.model !== "string") fail(record.model, `byTurn.${turnKey}.model`);
	}
	return value;
}

function parseState(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) fail(value, "state root");
	for (const key of Object.keys(value)) {
		if (key !== "open" && key !== "byTurn" && key !== "lastModel") fail(value, `state root key ${JSON.stringify(key)}`);
	}
	if (value.lastModel !== null && typeof value.lastModel !== "string") fail(value.lastModel, "state.lastModel");
	const open = value.open;
	if (open !== null) {
		if (typeof open !== "object" || Array.isArray(open)) fail(open, "state.open");
		for (const key of Object.keys(open)) {
			if (key !== "turn" && key !== "step") fail(open, `state.open key ${JSON.stringify(key)}`);
		}
		if (!Number.isInteger(open.turn) || open.turn < 0) fail(open.turn, "state.open.turn");
		if (open.step !== null && (!Number.isInteger(open.step) || open.step < 0)) fail(open.step, "state.open.step");
	}
	parseView({ byTurn: value.byTurn });
	return value;
}

const viewSchema = { parse: parseView };
const stateSchema = { parse: parseState };

/**
 * Pure fold over committed session events.
 *
 * `request/header` events carry no turn coordinates (they are logged inside a
 * step, between step/start and the first chunk), and they are appended ONLY
 * when the header CHANGES — a turn that reuses the previous configuration
 * produces no header event at all. The unit therefore tracks the open
 * turn/step itself from the boundary events (strictly seq-ordered), records
 * the model of every in-turn header, and has each new turn INHERIT the last
 * known model until an in-turn header replaces it. Headers logged outside
 * any turn (session titles, compaction) are ignored. Plain-JSON state,
 * synchronous apply — the projection contract.
 */
const unit = {
	key: "dsh-response-meta",
	stateSchema,
	init: () => ({
		open: null,
		lastModel: null,
		byTurn: {}
	}),
	apply: (state, event) => {
		switch (event.type) {
			case "turn/start": {
				if (state.open !== null && state.open.turn === event.data.turn) return state;
				const turnKey = String(event.data.turn);
				const previous = state.byTurn[turnKey];
				if (previous === void 0) {
					return {
						...state,
						open: { turn: event.data.turn, step: null },
						byTurn: {
							...state.byTurn,
							[turnKey]: { model: state.lastModel }
						}
					};
				}
				return { ...state, open: { turn: event.data.turn, step: null } };
			}
			case "step/start": {
				const nextOpen = { turn: event.data.turn, step: event.data.step };
				return state.open !== null && state.open.turn === nextOpen.turn && state.open.step === nextOpen.step ? state : { ...state, open: nextOpen };
			}
			case "turn/end": {
				if (state.open === null || state.open.turn !== event.data.turn) return state;
				return { ...state, open: null };
			}
			case "request/header": {
				if (state.open === null) return state;
				const header = event.data.header;
				const model = typeof header?.config?.model === "string" && header.config.model !== "" ? header.config.model : null;
				const turnKey = String(state.open.turn);
				const previous = state.byTurn[turnKey];
				if (previous !== void 0 && previous.model === model && state.lastModel === model) return state;
				return {
					...state,
					lastModel: model,
					byTurn: {
						...state.byTurn,
						[turnKey]: { model }
					}
				};
			}
			default:
				return state;
		}
	},
	wire: {
		viewSchema,
		view: (state) => ({ byTurn: state.byTurn })
	},
	stateVersion: 2
};

/** Cordis plugin name. */
export const name = "dsh-response-meta";

/** Services required: the projection registry is the plugin's whole purpose. */
export const inject = ["sessionProjections"];

/**
 * Register the `dsh-response-meta` projection unit; the registration rides this
 * plugin's fiber, so unloading the plugin removes the key.
 * @param ctx - registrant context carrying the projection registry.
 */
export function apply(ctx) {
	ctx.sessionProjections.register(unit);
}

export { unit as responseMetaUnit };
