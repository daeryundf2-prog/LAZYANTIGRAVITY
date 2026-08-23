/**
 * Dynamic Antigravity Hook & Schema Discovery
 * Inspects host runtime environment and auto-binds supported hook capabilities.
 */

export interface DiscoveredHookCapability {
	readonly event: string;
	readonly supported: boolean;
	readonly failOpen: boolean;
	readonly timeoutMs: number;
}

export interface RuntimeDiscoveryReport {
	readonly runtime: "Antigravity" | "Codex" | "Standalone";
	readonly version: string;
	readonly capabilities: readonly DiscoveredHookCapability[];
	readonly dynamicDiscoveryActive: boolean;
}

const KNOWN_ANTIGRAVITY_EVENTS = [
	"SessionStart",
	"UserPromptSubmit",
	"PreToolUse",
	"PostToolUse",
	"PostCompact",
	"Stop",
	"SubagentStop",
	"SubagentCompleted",
	"SessionEnd",
] as const;

export function discoverRuntimeHooks(env: Record<string, string | undefined> = process.env): RuntimeDiscoveryReport {
	const isAntigravity = Boolean(
		env["ANTIGRAVITY_PLUGIN_ROOT"] || env["ANTIGRAVITY_SESSION_ID"] || env["AGY_CLI"] || env["GEMINI_ANTIGRAVITY"],
	);
	const isCodex = Boolean(env["CODEX_PLUGIN_ROOT"] || env["CODEX_WORKSPACE"]);

	const runtime = isAntigravity ? "Antigravity" : isCodex ? "Codex" : "Standalone";
	const version = env["ANTIGRAVITY_VERSION"] || env["CODEX_VERSION"] || "2.0.0-dynamic";

	const capabilities: DiscoveredHookCapability[] = KNOWN_ANTIGRAVITY_EVENTS.map((event) => {
		const isSupported = isAntigravity || isCodex || event !== "SubagentStop";
		return {
			event,
			supported: isSupported,
			failOpen: true,
			timeoutMs: event === "PostToolUse" || event === "SessionStart" ? 10000 : 3000,
		};
	});

	return {
		runtime,
		version,
		capabilities,
		dynamicDiscoveryActive: true,
	};
}
