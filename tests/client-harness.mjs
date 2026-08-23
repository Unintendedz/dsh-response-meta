// Client-bundle harness test for dsh-response-meta.
// Loads lib/client.js under a window stub (no real browser needed), then
// exercises the pure readout math, the apply registration, and a full
// component render with mocked framework hooks.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

function assert(condition, message) {
	if (!condition) {
		console.error(`FAIL: ${message}`);
		process.exit(1);
	}
}

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(here, "..", "lib", "client.js");
const bundleText = readFileSync(bundlePath, "utf8");

// ── window stub ────────────────────────────────────────────────────────────
let api;
globalThis.window = {
	__ModuleLoader__: {
		load(spec) {
			api = spec.factory((id) => {
				if (id === "react/jsx-runtime") {
					return {
						jsx: (type, props) => ({ type, props }),
						jsxs: (type, props) => ({ type, props }),
						Fragment: Symbol.for("react.fragment")
					};
				}
				if (id === "react") {
					return {
						memo: (component) => component,
						useMemo: (compute) => compute()
					};
				}
				throw new Error(`unexpected require in client bundle: ${id}`);
			});
			return api;
		}
	}
};

// Syntax gate: the bundle must compile as a script.
new Function(bundleText);
await import(pathToFileURL(bundlePath).href);
assert(api !== void 0, "bundle did not register through window.__ModuleLoader__");
assert(typeof api.apply === "function" && typeof api.inject !== "undefined", "bundle must export apply and inject");
assert(api.inject.includes("slots") && api.inject.includes("locale"), "client inject must declare slots and locale");

// ── pure math ──────────────────────────────────────────────────────────────
assert(api.compactNumber(34) === "34", `compactNumber(34), got ${api.compactNumber(34)}`);
assert(api.compactNumber(1234) === "1.2k", `compactNumber(1234), got ${api.compactNumber(1234)}`);
assert(api.compactNumber(12034) === "12k", `compactNumber(12034), got ${api.compactNumber(12034)}`);
assert(api.decodeMsOf({ firstTokenTime: 1000, completedTime: 21000 }) === 20000, "decodeMsOf delta");
assert(api.decodeMsOf({ firstTokenTime: null, completedTime: 21000 }) === null, "decodeMsOf null first token");
assert(api.tokensPerSecond(680, 20000) === 34, "tokensPerSecond 680/20s");
assert(api.tokensPerSecond(null, 20000) === null && api.tokensPerSecond(680, 0) === null, "tokensPerSecond null guards");
assert(api.reasoningCharsOf([{ kind: "reasoning", text: "abc" }, { kind: "text", text: "x" }]) === 3, "reasoningCharsOf counts reasoning blocks only");
assert(api.outputTokensOf({ outputTokens: 42 }) === 42 && api.outputTokensOf(null) === null, "outputTokensOf guards");

const zh = {
	"thinking": "思考 {amount} tok",
	"thinkingChars": "思考 {amount} 字",
	"tokensPerSecond": "{tps} tok/s",
	"tokensPerSecondEstimated": "~{tps} tok/s",
	"clock.md": "{m}月{d}日",
	"clock.ymd": "{y}年{m}月{d}日",
	"ranFor": "用时 {duration}",
	"ttft": "首 token {seconds}秒",
	"duration.seconds": "{seconds}秒",
	"duration.minutes": "{minutes}分{seconds}秒"
};
const t = (key, params = {}) => Object.entries(params).reduce(
	(line, [name, value]) => line.replace(`{${name}}`, String(value)),
	zh[key]
);

const completedAt = new Date(2026, 7, 23, 14, 16, 0, 0).getTime();
const referenceNow = new Date(2026, 7, 23, 15, 0, 0, 0).getTime();
const firstTokenAt = completedAt - 20_000;
const stepStartAt = firstTokenAt - 2_100;
const turnTiming = { startTime: completedAt - 144_000, endTime: completedAt };

const node = {
	kind: "assistant",
	messageId: "m1",
	turn: 3,
	blocks: [{ kind: "reasoning", text: "repeated".repeat(10) }],
	usage: { outputTokens: 680, reasoningTokens: 400 },
	timing: { stepStartTime: stepStartAt, firstTokenTime: firstTokenAt, completedTime: completedAt }
};

assert(api.formatRunDuration(144_000, t) === "2分24秒", "formatRunDuration mirrors native whole-second formatting");
assert(api.formatLatencySeconds(2_100) === "2.1", "formatLatencySeconds mirrors native sub-ten-second precision");
assert(api.formatMessageClock(completedAt, t, referenceNow) === "14:16", "formatMessageClock keeps today's timestamp compact");

const full = api.deriveReadout(node, "deepseek-v4-flash", t, { turnTiming, now: referenceNow });
assert(full === "deepseek-v4-flash · 思考 400 tok · 34 tok/s · 14:16 · 用时 2分24秒 · 首 token 2.1秒", `full readout, got ${JSON.stringify(full)}`);

const noTokens = api.deriveReadout({ ...node, usage: undefined }, "deepseek-v4-flash", t, { turnTiming, now: referenceNow });
assert(noTokens === "deepseek-v4-flash · 思考 80 字 · 14:16 · 用时 2分24秒 · 首 token 2.1秒", `chars fallback readout, got ${JSON.stringify(noTokens)}`);

const modelOnly = api.deriveReadout({ ...node, blocks: [], usage: undefined, timing: undefined }, "m", t);
assert(modelOnly === "m", `model-only readout, got ${JSON.stringify(modelOnly)}`);

assert(api.deriveReadout({ ...node, blocks: [], usage: undefined, timing: undefined }, null, t) === null, "no data at all renders nothing");
assert(api.deriveReadout(null, "m", t) === null, "null node renders nothing");
assert(bundleText.includes("[data-time-hover-root] [data-slot$=assistant-actions]:has(>[data-dsh-response-meta=complete])~span:last-child{display:none}"), "completed readout must hide only its sibling native assistant clock");

// ── apply registration with a mock client ctx ──────────────────────────────
const registrations = [];
const dictionaries = [];
const injectedKeys = [];
const definitions = [];
const ctx = {
	effect: (fn) => {
		fn();
		return () => {};
	},
	locale: {
		register: (ns, dicts) => dictionaries.push([ns, dicts])
	},
	conversationEvents: {
		register: (definition) => {
			definitions.push(definition);
			return () => {};
		}
	},
	slots: {
		inject: (key, fn) => {
			injectedKeys.push(key);
			fn();
			return () => {};
		},
		register: (options, component) => {
			registrations.push({ options, component });
			return () => {};
		}
	}
};
api.apply(ctx);
assert(api.inject.includes("conversationEvents"), "client inject declares conversationEvents");
assert(dictionaries.length === 1 && dictionaries[0][0] === "dsh-response-meta", "dictionaries registered under the plugin namespace");
assert(registrations.length === 2, `two slot entries registered, got ${registrations.length}`);
assert(injectedKeys.includes("conversation.chat.assistant-actions") && injectedKeys.includes("conversation.chat.node"), `both slot keys injected, got ${JSON.stringify(injectedKeys)}`);
const stripEntry = registrations.find((entry) => entry.options.name === "conversation.chat.assistant-actions");
const nodeEntry = registrations.find((entry) => entry.options.name === "conversation.chat.node");
assert(stripEntry !== undefined, "assistant-actions entry registered");
assert(stripEntry.options.id === "dsh-response-meta", "entry id is dsh-response-meta");
assert(stripEntry.options.order === 100, "entry order is 100");
assert(nodeEntry !== undefined && nodeEntry.options.key === "dsh-response-meta-aborted", "aborted chat-node entry registered under its key");
assert(definitions.length === 1 && definitions[0].kind === "dsh-response-meta-aborted" && definitions[0].target === "chat", "aborted-step conversation definition registered");
assert(typeof stripEntry.component === "function" && typeof nodeEntry.component === "function", "registered components are functions");

// ── component render with mocked framework hooks ───────────────────────────
const component = stripEntry.component;
const realDateNow = Date.now;
Date.now = () => referenceNow;
let render;
try {
	render = component({
		messageId: "m1",
		useSession: (selector) => selector({ nodes: [node], turnTimings: new Map([[3, turnTiming]]) }),
		useProjection: () => ({ byTurn: { "3": { model: "deepseek-v4-flash" } } }),
		t
	});
} finally {
	Date.now = realDateNow;
}
assert(render !== null && render.type === "span", "component renders a span when data exists");
assert(render.props["data-dsh-response-meta"] === "complete", "completed readout is tagged separately from aborted rows");
assert(render.props.children === "deepseek-v4-flash · 思考 400 tok · 34 tok/s · 14:16 · 用时 2分24秒 · 首 token 2.1秒", `rendered readout, got ${JSON.stringify(render.props.children)}`);

const blank = component({
	messageId: "m2",
	useSession: () => null,
	useProjection: () => ({ byTurn: {} }),
	t
});
assert(blank === null, "component renders nothing without a node");

const absentModel = component({
	messageId: "m1",
	useSession: (selector) => selector({ nodes: [{ ...node, blocks: [], usage: undefined, timing: undefined }] }),
	useProjection: () => ({ byTurn: {} }),
	t
});
assert(absentModel === null, "component renders nothing when every field is missing");

// ── aborted-step definition fold and node materialization ──────────────────
const definition = api.abortedStepDefinition;
const match = (event) => definition.match(event);
const stepStart = { type: "step/start", seq: 6, time: 1000, data: { turn: 1, step: 1 } };
const reasoningChunk = (text, time) => ({ type: "assistant/chunk", seq: 10, time, data: { turn: 1, step: 1, chunk: { type: "reasoning-delta", index: 0, text } } });
const textChunk = (text, time) => ({ type: "assistant/chunk", seq: 10, time, data: { turn: 1, step: 1, chunk: { type: "text-delta", index: 1, text } } });
const emptyMessage = { type: "assistant/message", seq: 11, time: 21000, data: { turn: 1, step: 1, message: { content: [] } } };
const textMessage = { type: "assistant/message", seq: 11, time: 21000, data: { turn: 1, step: 1, message: { content: [{ type: "text", text: "the answer" }] } } };
const reasoningOnlyMessage = { type: "assistant/message", seq: 11, time: 21000, data: { turn: 1, step: 1, message: { content: [{ type: "reasoning", text: "thinking" }] }, usage: { outputTokens: 40, reasoningTokens: 30 } } };
const stepEnd = { type: "step/end", seq: 14, time: 5000, data: { turn: 1, step: 1 } };

assert(match(stepStart)?.role === "start", "step/start opens the context");
assert(match(reasoningChunk("a", 2000))?.role === "update" && match(stepEnd)?.role === "update", "chunks and step/end update the context");
assert(match({ type: "user/message", data: {} }) === null, "unrelated events decline");

// Fold: aborted step (chunks, no message, step/end) materializes a node with
// accumulated reasoning chars and token timing.
let state = definition.start({}, { event: stepStart });
state = definition.update({ state }, { event: reasoningChunk("hello", 2000) });
state = definition.update({ state }, { event: reasoningChunk(" world", 3000) });
state = definition.update({ state }, { event: stepEnd });
const abortedNode = definition.buildViewNode({ key: "k", kind: definition.kind, id: "1:1", state, start: { location: { kind: "step" } }, matches: [{ location: { kind: "step" } }] });
assert(abortedNode !== null, "aborted step materializes its node");
assert(abortedNode.kind === "dsh-response-meta-aborted" && abortedNode.target === "chat" && abortedNode.anchorSeq === 14, `aborted node shape, got ${JSON.stringify(abortedNode)}`);
assert(abortedNode.data.turn === 1 && abortedNode.data.step === 1 && abortedNode.data.reasoningChars === 11 && abortedNode.data.totalChars === 11, `aborted node data, got ${JSON.stringify(abortedNode.data)}`);
assert(abortedNode.data.firstTokenTime === 2000 && abortedNode.data.lastTokenTime === 3000 && abortedNode.data.outputTokens === null, `aborted node timing, got ${JSON.stringify(abortedNode.data)}`);
assert(abortedNode.visibility === "visible", "aborted node is visible");

// A text-finalized step hides the already-published live row (its answer has
// the strip readout) without withdrawing the stable conversation-node key.
let finalState = definition.start({}, { event: stepStart });
finalState = definition.update({ state: finalState }, { event: reasoningChunk("hi", 2000) });
finalState = definition.update({ state: finalState }, { event: textMessage });
finalState = definition.update({ state: finalState }, { event: stepEnd });
const finalizedNode = definition.buildViewNode({ key: "k", kind: definition.kind, id: "1:1", state: finalState, start: { location: { kind: "step" } }, matches: [] });
assert(finalizedNode !== null && finalizedNode.visibility === "hidden", `text-finalized step hides its live row, got ${JSON.stringify(finalizedNode)}`);

// The stop/finalize race: a reasoning-only assistant/message does NOT count
// as a visible answer, so the aborted node still materializes — and now
// carries the message's real usage for a genuine toks/s.
let racedState = definition.start({}, { event: stepStart });
racedState = definition.update({ state: racedState }, { event: reasoningChunk("partial", 1500) });
racedState = definition.update({ state: racedState }, { event: reasoningOnlyMessage });
racedState = definition.update({ state: racedState }, { event: stepEnd });
const racedNode = definition.buildViewNode({ key: "k", kind: definition.kind, id: "1:1", state: racedState, start: { location: { kind: "step" } }, matches: [] });
assert(racedNode !== null && racedNode.data.reasoningChars === 7, `raced reasoning-only final still materializes, got ${JSON.stringify(racedNode)}`);
assert(racedNode.data.outputTokens === 40 && racedNode.data.reasoningTokens === 30 && racedNode.data.messageTime === 21000, `raced node carries usage, got ${JSON.stringify(racedNode.data)}`);

// llm/retry resets accumulated reasoning, timing, and the text-finalized flag.
let retried = definition.start({}, { event: stepStart });
retried = definition.update({ state: retried }, { event: reasoningChunk("discarded", 2000) });
retried = definition.update({ state: retried }, { event: { type: "llm/retry", seq: 9, time: 2500, data: { turn: 1, step: 1 } } });
assert(retried.reasoningChars === 0 && retried.textFinalized === false && retried.firstTokenTime === null, "llm/retry resets the fold");

// A still-open step materializes a visible meta row immediately; streamed
// chunks update it at animation-frame cadence instead of waiting for step/end.
const openState = definition.update({ state: definition.start({}, { event: stepStart }) }, { event: reasoningChunk("partial", 2000) });
const liveNode = definition.buildViewNode({ key: "k", kind: definition.kind, id: "1:1", state: openState, start: { location: { kind: "step" } }, matches: [] });
assert(liveNode !== null && liveNode.visibility === "visible" && liveNode.data.status === "running", `open step must publish live meta, got ${JSON.stringify(liveNode)}`);
assert(liveNode.anchorSeq === 10 && liveNode.data.reasoningChars === 7, `live meta must follow the latest streamed chunk, got ${JSON.stringify(liveNode)}`);
assert(definition.publication({ event: reasoningChunk("next", 2500) }) === "animation-frame", "streamed meta updates publish once per animation frame");

// ── aborted-node component render with mocked framework hooks ──────────────
const abortedComponent = nodeEntry.component;
// The same keyed row is live before completion, distinguished semantically
// while reusing the incremental readout math.
const liveRender = abortedComponent({
	node: { data: { status: "running", turn: 5, step: 1, reasoningChars: 80, totalChars: 80, outputTokens: null, reasoningTokens: null, firstTokenTime: 1000, lastTokenTime: 5000, messageTime: null } },
	useProjection: () => ({ byTurn: { "5": { model: "deepseek-v4-pro" } } }),
	t
});
assert(liveRender !== null && liveRender.props["data-dsh-response-meta"] === "live", `running component must expose the live marker, got ${JSON.stringify(liveRender)}`);
assert(liveRender.props.children.props.children === "deepseek-v4-pro · 思考 80 字 · ~5 tok/s", `live readout, got ${JSON.stringify(liveRender.props.children.props.children)}`);

// Chunked abort without usage: estimated reasoning toks/s (80 chars / 4 = 20
// tokens over 4s = 5 tok/s), shown with the ~ marker.
const abortedRender = abortedComponent({
	node: { data: { status: "aborted", turn: 5, step: 1, reasoningChars: 80, totalChars: 80, outputTokens: null, reasoningTokens: null, firstTokenTime: 1000, lastTokenTime: 5000, messageTime: null } },
	useProjection: () => ({ byTurn: { "5": { model: "deepseek-v4-pro" } } }),
	t
});
assert(abortedRender !== null && abortedRender.type === "div", "aborted component renders a row");
assert(abortedRender.props["data-dsh-response-meta"] === "aborted", "aborted readout tagged");
assert(abortedRender.props.children.props.children === "deepseek-v4-pro · 思考 80 字 · ~5 tok/s", `estimated aborted readout, got ${JSON.stringify(abortedRender.props.children.props.children)}`);

// Finalization race: real provider usage → real toks/s (40 tokens over 20s).
const racedRender = abortedComponent({
	node: { data: { turn: 5, step: 1, reasoningChars: 7, totalChars: 7, outputTokens: 40, reasoningTokens: 30, firstTokenTime: 1000, lastTokenTime: 1500, messageTime: 21000 } },
	useProjection: () => ({ byTurn: { "5": { model: "deepseek-v4-pro" } } }),
	t
});
assert(racedRender.props.children.props.children === "deepseek-v4-pro · 思考 30 tok · 2 tok/s", `raced readout, got ${JSON.stringify(racedRender.props.children.props.children)}`);

// Stop before the first token: model-only line still renders.
const earlyStop = abortedComponent({
	node: { data: { turn: 5, step: 1, reasoningChars: 0, totalChars: 0, outputTokens: null, reasoningTokens: null, firstTokenTime: null, lastTokenTime: null, messageTime: null } },
	useProjection: () => ({ byTurn: { "5": { model: "deepseek-v4-pro" } } }),
	t
});
assert(earlyStop !== null && earlyStop.props.children.props.children === "deepseek-v4-pro", `early-stop readout, got ${JSON.stringify(earlyStop?.props?.children?.props?.children)}`);

const abortedBlank = abortedComponent({
	node: { data: { turn: 5, step: 1, reasoningChars: 0, totalChars: 0, outputTokens: null, reasoningTokens: null, firstTokenTime: null, lastTokenTime: null, messageTime: null } },
	useProjection: () => ({ byTurn: {} }),
	t
});
assert(abortedBlank === null, "aborted component renders nothing without model or reasoning");

console.log("client bundle OK");
