export interface ThinkingBudgetDecision {
	budget: number;
	tier: "flash_lite" | "flash" | "pro";
	level: "off" | "standard" | "high" | "deep";
	rationale: string;
}

const ACTION_MODIFICATION_PATTERN =
	/수정|구현|작성|추가|생성|개발|빌드|고쳐|만들어|디버깅|패치|설계|fix|implement|create|add|write|build|update|refactor|generate|debug|patch/i;

const PURE_INQUIRY_PATTERN =
	/^(어디|위치|설명|찾아|오타|단순|간단|확인|알려|보여|조회|explain|where|what|how|why|which|show|find)/i;

export function computeThinkingBudget(prompt: string): ThinkingBudgetDecision {
	const trimmed = prompt.trim();
	if (!trimmed) {
		return { budget: 0, tier: "flash_lite", level: "off", rationale: "Empty or minimal prompt" };
	}

	const lower = trimmed.toLowerCase();

	// 1. Deep / Security / Adversarial Audit / Invariant Isolation
	if (
		/security|vulnerability|adversarial|audit|falsification|hypothesis-tree|arch-guard|architecture drift|clean architecture|race condition|exploit|consensus|보안|취약점|인젝션|침투|감사|반증|동시성|레이스|합의/i.test(
			lower,
		)
	) {
		return {
			budget: 64000,
			tier: "pro",
			level: "deep",
			rationale: "High-stakes security, adversarial audit, or deep architecture verification required",
		};
	}

	// 2. High / Multi-step Refactor / Flaky Guard / Swarm Sync / Complex Planning
	if (
		/ultrawork|\/ulw|ulw-plan|start-work|refactor|flaky-guard|flaky test|swarm-sync|worktree|mutation|ui-loopback|visual-qa|리팩토링|아키텍처|스트레스|자가 치유|돌연변이|워크트리|오케스트레이션/i.test(
			lower,
		)
	) {
		return {
			budget: 32768,
			tier: "flash",
			level: "high",
			rationale: "Complex multi-agent orchestration, refactoring, or visual/flaky testing loop",
		};
	}

	// 3. Fast-Pass Simple CLI or System Inquiries
	if (
		/^(git|github)\s+(status|diff|log|branch|show|remote)/i.test(trimmed) ||
		/^(ls|pwd|whoami|clear)(\s|$)/i.test(trimmed) ||
		(PURE_INQUIRY_PATTERN.test(trimmed) && !ACTION_MODIFICATION_PATTERN.test(trimmed))
	) {
		return {
			budget: 0,
			tier: "flash_lite",
			level: "off",
			rationale: "Direct low-complexity lookup or quick query",
		};
	}

	// 3b. Short single-intent inquiry (Quick-Lane: < 80 chars ending in ? / 줘 / 해봐 without code modification intent)
	if (
		trimmed.length < 80 &&
		(trimmed.endsWith("?") || trimmed.endsWith("줘") || trimmed.endsWith("해봐")) &&
		!ACTION_MODIFICATION_PATTERN.test(trimmed)
	) {
		return {
			budget: 0,
			tier: "flash_lite",
			level: "off",
			rationale: "Short direct question routed to quick-lane",
		};
	}

	// 4. Standard Default (Implementation, testing, debugging, code modification)
	return {
		budget: 8192,
		tier: "flash",
		level: "standard",
		rationale: "Standard code implementation, debugging, or test workflow",
	};
}

export function formatThinkingBudgetDirective(decision: ThinkingBudgetDecision): string {
	const decouplingSection =
		decision.level !== "off"
			? `\n## 2-Phase Cognitive Decoupling (Anti-Rationalization Protocol)
- Phase 1 (Thinking Trace): Prohibit post-hoc rationalization. Record ONLY raw data presence/absence, observed facts, and counter-evidence. If a hypothesis fails any observation, discard it immediately.
- Phase 2 (Response Formulation): Assert ONLY facts and conclusions that survived Phase 1 without contradiction.`
			: "";

	return `<adaptive-thinking-budget>
# Adaptive Reasoning Scaling (Gemini 3.8)
- Recommended Model Tier: Subagents[].Model = "${decision.tier}"
- Dynamic Thinking Budget: ${decision.budget} tokens (${decision.level.toUpperCase()})
- Routing Rationale: ${decision.rationale}${decouplingSection}
</adaptive-thinking-budget>`;
}
