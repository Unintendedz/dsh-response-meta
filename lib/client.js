window.__ModuleLoader__.load({
	id: "dsh-response-meta",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region lib/types/client/readout.js
		/**
		* Pure readout math: model name + reasoning extent + decode throughput,
		* computed from one finalized assistant node and the per-turn model
		* record of the `dsh-response-meta` host projection. Every helper is total —
		* missing or malformed fields degrade to `null`, never throw, and a
		* readout with nothing to say renders nothing.
		*/
		/** Guard one usage-style number. */
		function safeNumber(value) {
			return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
		}
		/** Provider-reported completion tokens, or null. */
		function outputTokensOf(usage) {
			return usage !== null && typeof usage === "object" ? safeNumber(usage.outputTokens) : null;
		}
		/** Provider-reported reasoning tokens, or null. */
		function reasoningTokensOf(usage) {
			return usage !== null && typeof usage === "object" ? safeNumber(usage.reasoningTokens) : null;
		}
		/** Total reasoning text length across one message's blocks. */
		function reasoningCharsOf(blocks) {
			if (!Array.isArray(blocks)) return 0;
			let chars = 0;
			for (const block of blocks) {
				if (block !== null && typeof block === "object" && block.kind === "reasoning" && typeof block.text === "string") chars += block.text.length;
			}
			return chars;
		}
		/** Decode wall time (first token → final message) in ms, or null. */
		function decodeMsOf(timing) {
			if (timing === null || typeof timing !== "object") return null;
			const first = safeNumber(timing.firstTokenTime);
			const completed = safeNumber(timing.completedTime);
			if (first === null || completed === null || completed <= first) return null;
			return completed - first;
		}
		/** Whole tokens per second over the decode span, or null. */
		function tokensPerSecond(outputTokens, decodeMs) {
			if (outputTokens === null || decodeMs === null || decodeMs <= 0) return null;
			return Math.max(0, Math.round(outputTokens / (decodeMs / 1e3)));
		}
		/** Compact token/chars formatting: 1234 → "1.2k", 12034 → "12k". */
		function compactNumber(value) {
			if (value >= 1e3) {
				const scaled = value / 1e3;
				const rendered = scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
				return `${String(rendered)}k`;
			}
			return String(value);
		}
		/** Native-compatible whole-second run duration. */
		function formatRunDuration(ms, t) {
			const total = Math.max(0, Math.floor(ms / 1e3));
			const minutes = Math.floor(total / 60);
			const seconds = total % 60;
			return minutes > 0 ? t("duration.minutes", {
				minutes,
				seconds: String(seconds).padStart(2, "0")
			}) : t("duration.seconds", { seconds });
		}
		/** Native-compatible first-token latency without the localized unit. */
		function formatLatencySeconds(ms) {
			const seconds = Math.max(0, ms) / 1e3;
			return seconds < 10 ? String(Math.round(seconds * 10) / 10) : String(Math.round(seconds));
		}
		/** Native-compatible date-aware local message clock. */
		function formatMessageClock(time, t, now = Date.now()) {
			const value = new Date(time);
			const reference = new Date(now);
			const clock = `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
			if (value.getFullYear() === reference.getFullYear() && value.getMonth() === reference.getMonth() && value.getDate() === reference.getDate()) return clock;
			const params = {
				y: value.getFullYear(),
				m: value.getMonth() + 1,
				d: value.getDate()
			};
			const date = value.getFullYear() === reference.getFullYear() ? t("clock.md", params) : t("clock.ymd", params);
			return `${date} ${clock}`;
		}
		/** Positive elapsed time between two timestamp fields, or null. */
		function elapsedMs(start, end) {
			const from = safeNumber(start);
			const to = safeNumber(end);
			return from !== null && to !== null && to >= from ? to - from : null;
		}
		/**
		* Assemble the display segments, dropping every unavailable part.
		* @param parts - model, reasoning extent, and throughput facts.
		* @param t - locale seat bound to this plugin's namespace.
		* @returns segments joined by " · ", or null when there is nothing to say.
		*/
		function readoutSegments(parts, t) {
			const segments = [];
			if (typeof parts.model === "string" && parts.model !== "") segments.push(parts.model);
			if (parts.reasoningTokens !== null && parts.reasoningTokens !== undefined && parts.reasoningTokens > 0) segments.push(t("thinking", { amount: compactNumber(parts.reasoningTokens) }));
			else if (parts.reasoningChars !== null && parts.reasoningChars !== undefined && parts.reasoningChars > 0) segments.push(t("thinkingChars", { amount: compactNumber(parts.reasoningChars) }));
			if (parts.tokensPerSecond !== null && parts.tokensPerSecond !== undefined && parts.tokensPerSecond > 0) segments.push(t("tokensPerSecond", { tps: String(parts.tokensPerSecond) }));
			else if (parts.tokensPerSecondEstimated !== null && parts.tokensPerSecondEstimated !== undefined && parts.tokensPerSecondEstimated > 0) segments.push(t("tokensPerSecondEstimated", { tps: String(parts.tokensPerSecondEstimated) }));
			if (typeof parts.clock === "string" && parts.clock !== "") segments.push(parts.clock);
			if (parts.runMs !== null && parts.runMs !== undefined) segments.push(t("ranFor", { duration: formatRunDuration(parts.runMs, t) }));
			if (parts.ttftMs !== null && parts.ttftMs !== undefined) segments.push(t("ttft", { seconds: formatLatencySeconds(parts.ttftMs) }));
			return segments.length === 0 ? null : segments.join(" · ");
		}
		/**
		* Fold one finalized assistant node plus the per-turn model record into
		* the final display string (or null).
		* @param node - the finalized assistant node (legacy snapshot shape).
		* @param model - the model name for the node's turn, when known.
		* @param t - locale seat bound to this plugin's namespace.
		* @returns the compact readout line, or null when nothing is available.
		*/
		function deriveReadout(node, model, t, options = {}) {
			if (node === null || typeof node !== "object") return null;
			const outputTokens = outputTokensOf(node.usage);
			const timing = { ...node.timing, firstTokenTime: safeNumber(node.timing?.firstTokenTime) ?? safeNumber(options?.settled?.firstTokenTime) };
			const completedAt = safeNumber(timing.completedTime);
			const turnTiming = options !== null && typeof options === "object" ? options.turnTiming : null;
			const now = options !== null && typeof options === "object" && safeNumber(options.now) !== null ? options.now : Date.now();
			return readoutSegments({
				model: typeof model === "string" ? model : null,
				reasoningTokens: reasoningTokensOf(node.usage),
				reasoningChars: reasoningCharsOf(node.blocks),
				tokensPerSecond: tokensPerSecond(outputTokens, decodeMsOf(timing)),
				clock: completedAt === null ? null : formatMessageClock(completedAt, t, now),
				runMs: turnTiming === null || typeof turnTiming !== "object" ? null : elapsedMs(turnTiming.startTime, turnTiming.endTime),
				ttftMs: elapsedMs(timing.stepStartTime, timing.firstTokenTime)
			}, t);
		}
		/**
		* Conversation definition for live and interrupted steps. It publishes
		* one incremental chat node while a response is streaming, then hides it
		* when a finalized visible answer can take over in the assistant action
		* strip. A manual stop, failure, or hard abort keeps the same node visible.
		* The node carries turn/step coordinates, accumulated reasoning text, and
		* token timing facts; the model name still comes from the
		* `dsh-response-meta` host projection.
		*
		* A stop that races with finalization leaves a reasoning-only
		* `assistant/message` in the log: the UI freezes that step as
		* "interrupted" with no action strip, so the suppression gate keys on
		* VISIBLE TEXT, not on the message event's mere existence — and that
		* message's provider usage still yields a REAL toks/s.
		*/
		function abortedStepId(turn, step) {
			return `${String(turn)}:${String(step)}`;
		}
		/** Whether one assistant message carries a visible text answer. */
		function messageHasText(message) {
			const content = message === null || typeof message !== "object" ? void 0 : message.content;
			if (!Array.isArray(content)) return false;
			return content.some((block) => block !== null && typeof block === "object" && block.type === "text" && typeof block.text === "string" && block.text.trim() !== "");
		}
		/** Whether one stream chunk is a token delta worth timing. */
		function isTokenChunk(chunk) {
			if (chunk === null || typeof chunk !== "object") return false;
			if (chunk.type === "text-delta" || chunk.type === "reasoning-delta") return typeof chunk.text === "string" && chunk.text !== "";
			if (chunk.type === "tool-call-delta") return typeof chunk.argumentsDelta === "string" && chunk.argumentsDelta !== "";
			return false;
		}
		function foldTokenChunk(state, chunk, time, seq) {
			const reasoning = chunk?.type === "reasoning-delta" && typeof chunk.text === "string" ? chunk.text.length : 0;
			const text = chunk?.type === "text-delta" && typeof chunk.text === "string" ? chunk.text.length : 0;
			const token = isTokenChunk(chunk);
			if (reasoning === 0 && text === 0 && !token) return state;
			return {
				...state, latestSeq: seq,
				reasoningChars: state.reasoningChars + reasoning,
				totalChars: state.totalChars + reasoning + text,
				firstTokenTime: token && state.firstTokenTime === null ? time : state.firstTokenTime,
				lastTokenTime: token && time !== null ? time : state.lastTokenTime,
			};
		}
		/** Rebuild a V3 settlement after transient events are retired or on cold load. */
		function foldPackedStream(previous, event) {
			let state = { ...previous, reasoningChars: 0, totalChars: 0, firstTokenTime: null, lastTokenTime: null, usage: null };
			for (const record of event.data.stream) {
				if (record?.type === "chunk") {
					state = foldTokenChunk(state, record.chunk, safeNumber(record.time), event.seq);
					if (record.chunk?.type === "usage") state.usage = { outputTokens: outputTokensOf(record.chunk.usage), reasoningTokens: reasoningTokensOf(record.chunk.usage) };
					continue;
				}
				const type = record?.type === "text-chunks" ? "text-delta" : record?.type === "reasoning-chunks" ? "reasoning-delta" : record?.type === "tool-call-chunks" ? "tool-call-delta" : null;
				const parts = type === "tool-call-delta" ? record.args : record?.texts;
				if (type === null || !Array.isArray(parts) || !Array.isArray(record.dt)) continue;
				let time = safeNumber(record.time0);
				for (const [index, part] of parts.entries()) {
					if (index > 0) time = time !== null && safeNumber(record.dt[index - 1]) !== null ? time + record.dt[index - 1] : null;
					state = foldTokenChunk(state, { type, text: part, argumentsDelta: part }, time, event.seq);
				}
			}
			return state;
		}
		const abortedStepDefinition = {
			kind: "dsh-response-meta-aborted",
			target: "chat",
			match: (event) => {
				const turn = event.data?.turn;
				const step = event.data?.step;
				if (event.type === "step/start" && Number.isSafeInteger(turn) && Number.isSafeInteger(step)) return {
					id: abortedStepId(turn, step),
					role: "start"
				};
				if ((event.type === "assistant/chunk" || event.type === "assistant/live-chunk" || event.type === "assistant/attempt" || event.type === "assistant/message" || event.type === "llm/retry" || event.type === "step/end") && Number.isSafeInteger(turn) && Number.isSafeInteger(step)) return {
					id: abortedStepId(turn, step),
					role: "update"
				};
				return null;
			},
			start: (_context, match) => {
				if (match.event.type !== "step/start") throw new Error("dsh-response-meta-aborted start requires step/start");
				return {
					turn: match.event.data.turn,
					step: match.event.data.step,
					latestSeq: match.event.seq,
					ended: false,
					textFinalized: false,
					endSeq: 0,
					reasoningChars: 0,
					totalChars: 0,
					firstTokenTime: null,
					lastTokenTime: null,
					usage: null,
					messageTime: null
				};
			},
			update: (context, match) => {
				const event = match.event;
				if (event.type === "assistant/message" || event.type === "assistant/attempt") {
					const base = Array.isArray(event.data.stream) ? foldPackedStream(context.state, event) : context.state;
					const hasText = messageHasText(event.data.message);
					const usage = event.data.usage;
					const usageRecord = usage === null || typeof usage !== "object" ? base.usage : {
						outputTokens: outputTokensOf(usage),
						reasoningTokens: reasoningTokensOf(usage)
					};
					const next = {
						...base,
						latestSeq: event.seq,
						textFinalized: context.state.textFinalized || hasText,
						usage: usageRecord,
						messageTime: typeof event.time === "number" ? event.time : null
					};
					if (next.textFinalized === context.state.textFinalized && next.usage === context.state.usage && next.messageTime === context.state.messageTime && base === context.state) return context.state;
					return next;
				}
				if (event.type === "step/end") return context.state.ended === true ? context.state : {
					...context.state,
					latestSeq: event.seq,
					ended: true,
					endSeq: event.seq
				};
				if (event.type === "llm/retry") return {
					...context.state,
					latestSeq: event.seq,
					textFinalized: false,
					reasoningChars: 0,
					totalChars: 0,
					firstTokenTime: null,
					lastTokenTime: null,
					usage: null,
					messageTime: null
				};
				if (event.type === "assistant/chunk" || event.type === "assistant/live-chunk") {
					return foldTokenChunk(context.state, event.data.chunk, safeNumber(event.time), event.seq);
				}
				return context.state;
			},
			publication: (match) => ["assistant/chunk", "assistant/live-chunk"].includes(match.event.type) ? "animation-frame" : "immediate",
			buildViewNode: (context) => {
				const state = context.state;
				if (state === undefined) return null;
				const location = context.start?.location ?? context.matches[0]?.location ?? { kind: "unresolved" };
				return {
					key: context.key,
					kind: "dsh-response-meta-aborted",
					id: context.id,
					target: "chat",
					anchorSeq: state.latestSeq,
					location,
					visibility: state.textFinalized ? "hidden" : "visible",
					data: {
						status: state.ended ? "aborted" : "running",
						turn: state.turn,
						step: state.step,
						reasoningChars: state.reasoningChars,
						totalChars: state.totalChars,
						outputTokens: state.usage === null ? null : state.usage.outputTokens,
						reasoningTokens: state.usage === null ? null : state.usage.reasoningTokens,
						firstTokenTime: state.firstTokenTime,
						lastTokenTime: state.lastTokenTime,
						messageTime: state.messageTime
					}
				};
			}
		};
		/** Fixed-density heuristic: chars per token, mirroring dsh-token-meter. */
		const CHARS_PER_TOKEN = 4;
		/**
		* Assemble the incremental readout for one running or aborted step: model
		* name, the reasoning extent accumulated so far, and a
		* throughput reading. Provider usage (a finalization race) yields the
		* real toks/s; otherwise the streamed chars give a `~` estimated
		* reasoning toks/s over the token span. Null when nothing is known.
		* @param data - the view node's data.
		* @param projection - the `dsh-response-meta` projection value.
		* @param t - locale seat bound to this plugin's namespace.
		* @returns the compact line, or null.
		*/
		function abortedReadout(data, projection, t) {
			if (data === null || typeof data !== "object") return null;
			const byTurn = projection === null || typeof projection !== "object" || projection === void 0 ? void 0 : projection.byTurn;
			const turnRecord = byTurn === null || typeof byTurn !== "object" ? void 0 : byTurn[String(data.turn)];
			const model = turnRecord === null || typeof turnRecord !== "object" ? void 0 : turnRecord.model;
			const reasoningTokens = data.reasoningTokens === null || typeof data.reasoningTokens !== "number" ? null : data.reasoningTokens;
			const reasoningChars = typeof data.reasoningChars === "number" ? data.reasoningChars : 0;
			// Real throughput: provider output tokens over first-token → final message.
			let realTokensPerSecond = null;
			if (data.outputTokens !== null && typeof data.outputTokens === "number" && typeof data.firstTokenTime === "number" && typeof data.messageTime === "number") {
				realTokensPerSecond = tokensPerSecond(data.outputTokens, data.messageTime - data.firstTokenTime);
			}
			// Estimated reasoning throughput: streamed chars over the token span.
			let estimatedTokensPerSecond = null;
			if (realTokensPerSecond === null && typeof data.totalChars === "number" && data.totalChars > 0 && typeof data.firstTokenTime === "number" && typeof data.lastTokenTime === "number") {
				const spanMs = data.lastTokenTime - data.firstTokenTime;
				if (spanMs > 0) {
					const estimatedTokens = Math.max(1, Math.round(data.totalChars / CHARS_PER_TOKEN));
					estimatedTokensPerSecond = Math.max(1, Math.round(estimatedTokens / (spanMs / 1e3)));
				}
			}
			return readoutSegments({
				model: typeof model === "string" ? model : null,
				reasoningTokens,
				reasoningChars,
				tokensPerSecond: realTokensPerSecond,
				tokensPerSecondEstimated: estimatedTokensPerSecond
			}, t);
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** Dictionary namespace owned by this plugin. */
		const NS = "dsh-response-meta";
		/** Simplified Chinese dictionary (the key-set source of truth). */
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
		/** English dictionary (same key set). */
		const en = {
			"thinking": "thinking {amount} tok",
			"thinkingChars": "thinking {amount} chars",
			"tokensPerSecond": "{tps} tok/s",
			"tokensPerSecondEstimated": "~{tps} tok/s",
			"clock.md": "{m}/{d}",
			"clock.ymd": "{y}-{m}-{d}",
			"ranFor": "Ran for {duration}",
			"ttft": "TTFT {seconds}s",
			"duration.seconds": "{seconds}s",
			"duration.minutes": "{minutes}m {seconds}s"
		};
		//#endregion
		//#region \0dsh-css:dsh-response-meta/ResponseMetaTag.module.css
		const css = ".drm_7cRfq_readout{color:var(--dsw-alias-label-tertiary);white-space:nowrap;font-size:11px;line-height:16px;font-variant-numeric:tabular-nums;user-select:none;pointer-events:none;margin-left:2px;display:inline-block;align-self:center}.drm_7cRfq_readout[data-dsh-response-meta=complete]{order:2;flex-basis:100%;white-space:normal;margin:2px 0 0;overflow-wrap:anywhere}.drm_7cRfq_abortedRow{padding:0 0 8px;display:flex}[data-turn-tail] [data-slot$=assistant-actions]:has(>[data-dsh-response-meta=complete])~span:last-child{display:none}[data-turn-tail]:has([data-dsh-response-meta=complete])>div:has(>[data-slot$=assistant-actions]){height:auto;flex-wrap:wrap;row-gap:4px}";
		const tagId = "dsh-response-meta/ResponseMetaTag.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.setAttribute("data-plugin-css", tagId);
			tag.dataset.plugin = "dsh-response-meta";
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var ResponseMetaTag_module_css_default = {
			"readout": "drm_7cRfq_readout",
			"abortedRow": "drm_7cRfq_abortedRow"
		};
		//#endregion
		//#region lib/types/client/ResponseMetaTag.js
		/**
		* One compact readout rendered inside the finalized assistant message's
		* action strip: `model · 思考 1.2k tok · 34 tok/s`. Reads the message
		* node from the conversation snapshot by its durable id and the model
		* name from the host projection keyed by turn.
		* @param props - the action-strip owner (messageId) plus the framework
		* session kit (useChat, useProjection, t).
		* @returns the readout span, or null when nothing is available.
		*/
		const ResponseMetaTag = (0, react.memo)(function ResponseMetaTag({ messageId, useChat, useProjection, t }) {
			const node = useChat((snapshot) => {
				const nodes = snapshot.legacy.nodes;
				for (let index = 0; index < nodes.length; index++) {
					const candidate = nodes[index];
					if (candidate.kind === "assistant" && candidate.messageId === messageId) return candidate;
				}
				return null;
			});
			const turnTiming = useChat((snapshot) => {
				if (node === null) return null;
				const timings = snapshot.legacy.turnTimings;
				return timings !== null && typeof timings === "object" && typeof timings.get === "function" ? timings.get(node.turn) ?? null : null;
			});
			const settled = useChat((snapshot) => {
				if (node === null) return null;
				for (const candidate of snapshot.nodes?.values?.() ?? []) {
					if (candidate.kind === "dsh-response-meta-aborted" && candidate.data?.turn === node.turn && candidate.data?.step === node.step) return candidate.data;
				}
				return null;
			});
			const projection = useProjection("dsh-response-meta");
			const line = (0, react.useMemo)(() => {
				if (node === null) return null;
				const byTurn = projection === null || typeof projection !== "object" || projection === void 0 ? void 0 : projection.byTurn;
				const turnRecord = byTurn === null || typeof byTurn !== "object" ? void 0 : byTurn[String(node.turn)];
				const model = turnRecord === null || typeof turnRecord !== "object" ? void 0 : turnRecord.model;
				return deriveReadout(node, model, t, { turnTiming, settled, now: Date.now() });
			}, [node, turnTiming, settled, projection, t]);
			if (line === null) return null;
			return (0, react_jsx_runtime.jsx)("span", {
				className: ResponseMetaTag_module_css_default.readout,
				"data-dsh-response-meta": "complete",
				title: line,
				children: line
			});
		});
		//#endregion
		//#region lib/types/client/ResponseMetaAbortedNode.js
		/**
		* Readout row for one running or aborted step: model name plus the partial
		* reasoning extent and estimated throughput accumulated so far. Renders
		* nothing when there is nothing to say.
		* @param props - the chat-node owner (node with {turn, reasoningChars})
		* plus the framework session kit (useProjection, t).
		* @returns the readout row, or null when nothing is available.
		*/
		const ResponseMetaAbortedNode = (0, react.memo)(function ResponseMetaAbortedNode({ node, useProjection, t }) {
			const projection = useProjection("dsh-response-meta");
			const line = (0, react.useMemo)(() => abortedReadout(node?.data, projection, t), [node, projection, t]);
			if (line === null) return null;
			return (0, react_jsx_runtime.jsx)("div", {
				className: ResponseMetaTag_module_css_default.abortedRow,
				"data-dsh-response-meta": node?.data?.status === "running" ? "live" : "aborted",
				children: (0, react_jsx_runtime.jsx)("span", {
					className: ResponseMetaTag_module_css_default.readout,
					title: line,
					children: line
				})
			});
		});
		//#endregion
		//#region lib/types/client/index.js
		/** Services required for the entries, the definition, and its dictionaries. */
		const inject = [
			"slots",
			"locale",
			"uiConversation"
		];
		/**
		* Client plugin body: register the dictionaries, the finalized-message
		* action-strip readout, and the incremental live/aborted chat node. The
		* latter updates during streaming and remains visible when a step ends
		* without a final message.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-response-meta: dictionaries");
			ctx.uiConversation.events.register(abortedStepDefinition);
			ctx.slots.inject("conversation.chat.assistant-actions", () => ctx.slots.register({
				name: "conversation.chat.assistant-actions",
				id: "dsh-response-meta",
				order: 100,
				locale: NS
			}, ResponseMetaTag));
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "dsh-response-meta-aborted",
				locale: NS
			}, ResponseMetaAbortedNode));
		}
		//#endregion
		exports.ResponseMetaTag = ResponseMetaTag;
		exports.ResponseMetaAbortedNode = ResponseMetaAbortedNode;
		exports.apply = apply;
		exports.inject = inject;
		exports.deriveReadout = deriveReadout;
		exports.abortedReadout = abortedReadout;
		exports.abortedStepDefinition = abortedStepDefinition;
		exports.compactNumber = compactNumber;
		exports.formatRunDuration = formatRunDuration;
		exports.formatLatencySeconds = formatLatencySeconds;
		exports.formatMessageClock = formatMessageClock;
		exports.tokensPerSecond = tokensPerSecond;
		exports.decodeMsOf = decodeMsOf;
		exports.reasoningCharsOf = reasoningCharsOf;
		exports.outputTokensOf = outputTokensOf;
		exports.reasoningTokensOf = reasoningTokensOf;
		return module.exports;
	}
});
