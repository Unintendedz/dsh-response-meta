// Live end-to-end check against a running dsh web server (test port).
// Creates a session, sends one tiny prompt, waits for the turn to settle,
// then asserts the dsh-response-meta projection is served with the model record.
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://127.0.0.1:33880";
const PLUGIN_DIR = fileURLToPath(new URL("..", import.meta.url));

async function rpc(method, payload, rpcId) {
	const response = await fetch(`${BASE}/api/${method}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ type: "client-request", rpcId: rpcId ?? `r-${Math.random()}`, method, payload })
	});
	if (response.status !== 200) throw new Error(`${method}: HTTP ${response.status}`);
	const envelope = await response.json();
	if (envelope.result?.ok !== true) throw new Error(`${method}: ${JSON.stringify(envelope.result)}`);
	return envelope.result.value;
}

const create = await rpc("session.create", { cwd: PLUGIN_DIR });
console.log(`created session ${create.sessionId}`);

const prompt = await rpc("session.prompt", {
	sessionId: create.sessionId,
	mode: "queue",
	content: [{ type: "text", text: "Reply with exactly: OK" }]
});
console.log(`prompt accepted: ${JSON.stringify(prompt)}`);

let history;
let responseMeta;
let settledPolls = 0;
for (let attempt = 0; attempt < 60; attempt++) {
	await new Promise((resolve) => setTimeout(resolve, 2000));
	history = await rpc("session.history", { sessionId: create.sessionId });
	const values = history.projections?.values;
	responseMeta = values?.["dsh-response-meta"];
	if (responseMeta !== undefined && Object.keys(responseMeta.byTurn ?? {}).length > 0) break;
	// A settled turn with an assistant message is also a completion signal.
	// The projection value may trail the event window by one poll (registry
	// drive vs history read), so allow a few polls before declaring absence.
	const events = (history.events ?? []).map((entry) => entry.event);
	const settled = events.some((event) => event.type === "assistant/message");
	if (settled) settledPolls += 1;
	const keys = history.projections === undefined ? "NO BLOCK" : Object.keys(values ?? {});
	console.log(`poll ${attempt}: tail=${JSON.stringify(events.slice(-4).map((event) => event.type))} proj=${JSON.stringify(keys)}`);
	if (settled && settledPolls > 4 && responseMeta === undefined) throw new Error("assistant/message settled but dsh-response-meta projection absent after 5 polls");
}

if (responseMeta === undefined) throw new Error("dsh-response-meta projection never arrived");
console.log(`dsh-response-meta projection: ${JSON.stringify(responseMeta)}`);
const models = Object.values(responseMeta.byTurn ?? {}).map((record) => record.model);
if (models.length === 0 || models.some((model) => typeof model !== "string" && model !== null)) throw new Error(`bad byTurn records: ${JSON.stringify(models)}`);
if (models.every((model) => model === null)) throw new Error("model record is null — header fold failed");
const textEvents = (history.events ?? []).filter((entry) => entry.event?.type === "assistant/message").length;
console.log(`assistant messages in window: ${textEvents}`);
console.log("live OK");
