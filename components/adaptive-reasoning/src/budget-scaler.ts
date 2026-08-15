export interface ThinkingBudgetDecision {
	budget: number;
	tier: "flash_lite" | "flash" | "pro";
	level: "off" | "standard" | "high" | "deep";
	rationale: string;
}

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

	// 3. Off / Fast-Pass Simple Queries
	if (
		/^(git\s+(status|diff|log|branch|show)|ls|pwd|whoami|clear)/i.test(trimmed) ||
		/^(어디|위치|설명|찾아|오타|단순|간단|확인|explain|where|what|how)/i.test(trimmed)
	) {
		return {
			budget: 0,
			tier: "flash_lite",
			level: "off",
			rationale: "Direct low-complexity lookup or quick query",
		};
	}

	// 4. Standard Default (Implementation, testing, debugging)
	return {
		budget: 8192,
		tier: "flash",
		level: "standard",
		rationale: "Standard code implementation, debugging, or test workflow",
	};
}

export function formatThinkingBudgetDirective(decision: ThinkingBudgetDecision): string {
	return `<adaptive-thinking-budget>
# Adaptive Reasoning Scaling (Gemini 3.7)
- Recommended Model Tier: Subagents[].Model = "${decision.tier}"
- Dynamic Thinking Budget: ${decision.budget} tokens (${decision.level.toUpperCase()})
- Routing Rationale: ${decision.rationale}
</adaptive-thinking-budget>`;
}
