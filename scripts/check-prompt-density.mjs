#!/usr/bin/env node
import { stdin, stderr, exit } from "node:process";

async function readStdin() {
	return new Promise((resolve) => {
		let data = "";
		stdin.setEncoding("utf8");
		stdin.on("data", (chunk) => {
			data += chunk;
		});
		stdin.once("end", () => resolve(data));
		stdin.once("error", () => resolve(""));
		if (stdin.isTTY) {
			resolve("");
		}
	});
}

async function main() {
	const rawInput = await readStdin();
	if (!rawInput.trim()) {
		exit(0);
	}

	let payload;
	try {
		payload = JSON.parse(rawInput);
	} catch {
		exit(0);
	}

	const prompt = payload.prompt;
	if (typeof prompt !== "string") {
		exit(0);
	}

	let score = 0;

	// Length checks
	if (prompt.length > 300) {
		score += 3;
	} else if (prompt.length > 100) {
		score += 2;
	} else if (prompt.length > 50) {
		score += 1;
	}

	// Code block check
	if (prompt.includes("```")) {
		score += 2;
	}

	// File/path check
	const pathRegex = /(?:\/|[a-zA-Z]:\\|\bfile:\/\/\/|\.[a-zA-Z0-9]+)\b/;
	if (pathRegex.test(prompt)) {
		score += 2;
	}

	// List check
	const listRegex = /(?:^\s*(?:[-*+]|\d+\.)\s+)/m;
	if (listRegex.test(prompt)) {
		score += 2;
	}

	// Verification check
	const verifyWords = ["test", "verify", "run", "spec", "assertion", "evidence", "check", "검증", "테스트", "실행"];
	const lowerPrompt = prompt.toLowerCase();
	if (verifyWords.some(word => lowerPrompt.includes(word))) {
		score += 1;
	}

	// Clamp score between 1 and 10
	const finalScore = Math.max(1, Math.min(10, score));

	if (finalScore <= 4) {
		stderr.write("\n\x1b[33m[LazyAntigravity] ⚠️ 프롬프트 밀도가 매우 낮습니다 (점수: " + finalScore + "/10).\x1b[0m\n");
		stderr.write("\x1b[33m이 상태로는 제미나이가 연산 강도를 최저로 낮추어 평이한 답변만 출력할 가능성이 높습니다.\x1b[0m\n");
		stderr.write("\x1b[36m추천하는 프롬프트 작성 팁:\x1b[0m\n");
		stderr.write(" - 명확한 파일 경로 나 함수/클래스명을 명시해 보세요.\n");
		stderr.write(" - 구현과 관련된 테스트 조건 및 구체적인 검증 방식을 기술해 보세요.\n");
		stderr.write(" - 계획이 복잡하다면 모달을 여는 '/grill-me' 계획 인터뷰를 먼저 활용해 보세요.\n\n");
	}

	exit(0);
}

main();
