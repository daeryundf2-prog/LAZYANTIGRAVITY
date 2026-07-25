import { appendLedgerEntry, loadLedger, stateDir } from "./audit-ledger.mjs";
import { appendAgentEvent } from "./agent-log.mjs";

const TOKEN_STATE_FILE = "token-usage.json";
const DEFAULT_PRICE_PER_M_INPUT = 1.50;
const DEFAULT_PRICE_PER_M_OUTPUT = 7.50;
const WARNING_THRESHOLD_USD = 10.0;
const CRITICAL_THRESHOLD_USD = 50.0;

const MODEL_PRICES = {
	"gemini-3.6-flash": { input: 1.50, output: 7.50, cacheHit: 0.15 },
	"gemini-3.5-flash": { input: 1.50, output: 9.00, cacheHit: 0.15 },
	"gemini-3.5-flash-lite": { input: 0.30, output: 2.50, cacheHit: 0.03 },
	"gemini-3.1-pro": { input: 1.25, output: 5.00, cacheHit: 0.125 },
	"claude-sonnet-4.6": { input: 3.00, output: 15.00, cacheHit: 0.30 },
	"claude-opus-4.6": { input: 15.00, output: 75.00, cacheHit: 1.50 },
	"gpt-5.6": { input: 2.50, output: 10.00, cacheHit: 0.25 },
};

export function recordTokenUsage(workspaceRoot, params) {
	const { agentKey, model, inputTokens, outputTokens, cacheHitTokens } = params;
	const prices = MODEL_PRICES[model] || { input: DEFAULT_PRICE_PER_M_INPUT, output: DEFAULT_PRICE_PER_M_OUTPUT, cacheHit: 0 };
	const inputCost = (inputTokens / 1_000_000) * prices.input;
	const outputCost = (outputTokens / 1_000_000) * prices.output;
	const cacheCost = ((cacheHitTokens || 0) / 1_000_000) * prices.cacheHit;
	const totalCost = inputCost + outputCost + cacheCost;

	appendLedgerEntry(workspaceRoot, {
		type: "token_usage",
		agent_key: agentKey,
		model,
		input_tokens: inputTokens,
		output_tokens: outputTokens,
		cache_hit_tokens: cacheHitTokens || 0,
		input_cost: inputCost,
		output_cost: outputCost,
		cache_cost: cacheCost,
		total_cost: totalCost,
	});

	return { totalCost, inputCost, outputCost, cacheCost };
}

export function getTokenUsageSummary(workspaceRoot, agentKey) {
	const ledger = loadLedger(workspaceRoot);
	const entries = ledger.filter(
		(e) => e.type === "token_usage" && (!agentKey || e.agent_key === agentKey),
	);

	const summary = {
		total_cost: 0,
		total_input_tokens: 0,
		total_output_tokens: 0,
		total_cache_hit_tokens: 0,
		by_model: {},
		by_agent: {},
		entries: entries.length,
	};

	for (const entry of entries) {
		summary.total_cost += entry.total_cost || 0;
		summary.total_input_tokens += entry.input_tokens || 0;
		summary.total_output_tokens += entry.output_tokens || 0;
		summary.total_cache_hit_tokens += entry.cache_hit_tokens || 0;

		const model = entry.model || "unknown";
		if (!summary.by_model[model]) {
			summary.by_model[model] = { cost: 0, input: 0, output: 0, count: 0 };
		}
		summary.by_model[model].cost += entry.total_cost || 0;
		summary.by_model[model].input += entry.input_tokens || 0;
		summary.by_model[model].output += entry.output_tokens || 0;
		summary.by_model[model].count++;

		const agent = entry.agent_key || "unknown";
		if (!summary.by_agent[agent]) {
			summary.by_agent[agent] = { cost: 0, input: 0, output: 0, count: 0 };
		}
		summary.by_agent[agent].cost += entry.total_cost || 0;
		summary.by_agent[agent].input += entry.input_tokens || 0;
		summary.by_agent[agent].output += entry.output_tokens || 0;
		summary.by_agent[agent].count++;
	}

	summary.warning = summary.total_cost > WARNING_THRESHOLD_USD;
	summary.critical = summary.total_cost > CRITICAL_THRESHOLD_USD;

	return summary;
}

export function checkCostThreshold(workspaceRoot, agentKey) {
	const summary = getTokenUsageSummary(workspaceRoot, agentKey);
	if (summary.critical) {
		return {
			level: "critical",
			message: `토큰 비용 임계값 초과 (CRITICAL): $${summary.total_cost.toFixed(2)} > $${CRITICAL_THRESHOLD_USD}. ` +
				`작업을 중단하고 비용을 검토하세요. / Token cost exceeded critical threshold.`,
		};
	}
	if (summary.warning) {
		return {
			level: "warning",
			message: `토큰 비용 경고: $${summary.total_cost.toFixed(2)} > $${WARNING_THRESHOLD_USD}. ` +
				`비용을 모니터링하세요. / Token cost warning.`,
		};
	}
	return { level: "ok", message: "" };
}

export function estimateCost(model, inputTokens, outputTokens, cacheHitTokens) {
	const prices = MODEL_PRICES[model] || { input: DEFAULT_PRICE_PER_M_INPUT, output: DEFAULT_PRICE_PER_M_OUTPUT, cacheHit: 0 };
	const inputCost = (inputTokens / 1_000_000) * prices.input;
	const outputCost = (outputTokens / 1_000_000) * prices.output;
	const cacheCost = ((cacheHitTokens || 0) / 1_000_000) * prices.cacheHit;
	return {
		input: inputCost,
		output: outputCost,
		cache: cacheCost,
		total: inputCost + outputCost + cacheCost,
		per1kTokens: (inputCost + outputCost) / Math.max(1, (inputTokens + outputTokens) / 1000),
	};
}
