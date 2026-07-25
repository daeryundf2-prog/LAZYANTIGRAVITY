import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PLATFORM_SIGNS = {
	antigravity: {
		env: ["ANTIGRAVITY_SESSION", "ANTIGRAVITY_WORKSPACE"],
		files: [".omo/boulder.json", ".omo/ulw-loop/brief.md"],
		hooks: ["PreInvocation", "Stop", "PreToolUse"],
	},
	opencode: {
		env: ["OPENCODE_SESSION"],
		files: [".opencode/"],
		hooks: ["chat.message", "tool.execute"],
	},
	codex: {
		env: ["CODEX_SESSION"],
		files: [".codex/"],
		hooks: ["SessionStart", "PreToolUse", "PostToolUse", "Stop"],
	},
	cursor: {
		env: ["CURSOR_SESSION"],
		files: [".cursor/"],
		hooks: [],
	},
};

const MODEL_RECOMMENDATIONS = {
	coding: {
		frontend: "gemini-3.6-flash (빠른 이터레이션, 프론트엔드 강점)",
		backend: "claude-sonnet-4.6 (복잡한 로직, 안정성)",
		system: "claude-opus-4.6 (시스템 설계, 아키텍처)",
		quick: "gemini-3.5-flash-lite (빠른 프로토타입, $0.30/$2.50)",
		agentic: "gpt-5.6 (에이전트 코딩, 툴 사용 안정성)",
	},
	research: {
		deep: "claude-opus-4.6 (심층 분석)",
		fast: "gemini-3.6-flash (빠른 조사, 237 t/s)",
	},
	refactor: {
		large: "claude-opus-4.6 (대규모 리팩토링)",
		small: "gemini-3.6-flash (소규모, 빠른 처리)",
	},
};

export function detectPlatform(workspaceRoot, env = process.env) {
	const detected = [];

	for (const [name, signs] of Object.entries(PLATFORM_SIGNS)) {
		let score = 0;

		for (const envVar of signs.env) {
			if (env[envVar]) score += 2;
		}

		for (const file of signs.files) {
			if (existsSync(join(workspaceRoot, file))) score += 1;
		}

		if (score > 0) {
			detected.push({ platform: name, score, confidence: score >= 3 ? "high" : score >= 2 ? "medium" : "low" });
		}
	}

	detected.sort((a, b) => b.score - a.score);

	return {
		primary: detected[0]?.platform || "unknown",
		all: detected,
		recommendation: getRecommendation(detected[0]?.platform),
	};
}

export function getRecommendation(platform) {
	if (platform === "antigravity") {
		return {
			note: "Antigravity 감지됨. Gemini 3.6 Flash 최적화.",
			strengths: ["프론트엔드 코딩", "빠른 이터레이션", "237 t/s 출력 속도", "1M 컨텍스트"],
			weaknesses: ["에이전트 코딭 품질", "툴 콜링 안정성", "compaction 후 망각"],
			tips: [
				"복잡한 작업은 Claude Opus로 위임 권장",
				"툴 콜이 실패하면 수동으로 도구 지정",
				"compaction 전에 중요 컨텍스트를 파일로 저장",
				"lazyantigravity work-supervisor로 품질 검증 활성화",
			],
		};
	}
	return null;
}

export function recommendModel(taskType, complexity = "medium") {
	const recs = MODEL_RECOMMENDATIONS[taskType];
	if (!recs) return null;
	return recs[complexity] || recs[Object.keys(recs)[0]];
}

export function getPlatformGuide(workspaceRoot) {
	const detection = detectPlatform(workspaceRoot);
	const guide = {
		platform: detection.primary,
		confidence: detection.all[0]?.confidence || "none",
		recommendation: detection.recommendation,
	};

	if (detection.primary === "antigravity") {
		guide.models = [
			{ name: "gemini-3.6-flash", use: "빠른 코딩, 프론트엔드", price: "$1.50/$7.50", speed: "237 t/s" },
			{ name: "gemini-3.5-flash-lite", use: "프로토타입, 단순 작업", price: "$0.30/$2.50", speed: "350 t/s" },
			{ name: "claude-sonnet-4.6", use: "복잡한 백엔드 로직", price: "$3.00/$15.00", speed: "~80 t/s" },
			{ name: "claude-opus-4.6", use: "시스템 설계, 아키텍처", price: "$15.00/$75.00", speed: "~40 t/s" },
		];
		guide.routing = {
			fast_iteration: "gemini-3.6-flash",
			complex_logic: "claude-sonnet-4.6",
			system_design: "claude-opus-4.6",
			cheap_prototype: "gemini-3.5-flash-lite",
		};
	}

	return guide;
}
