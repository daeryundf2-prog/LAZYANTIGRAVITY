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

	// XML or structural tags check (ensuring matching tag pairs)
	if (/<([a-zA-Z0-9_-]+)>(?:[\s\S]*?)<\/\1>/.test(prompt)) {
		score += 2;
	}

	// Negation detection to prevent false positives from phrases like "skip test" or "제외"
	const negationRegex = /(?:don't|do not|no|not|skip|without|제외|하지\s*말|생략|없(?:이|음|습니다))/i;
	function isNegated(text, word) {
		const idx = text.indexOf(word);
		if (idx === -1) return false;
		const beforeContext = text.slice(Math.max(0, idx - 15), idx);
		const afterContext = text.slice(idx + word.length, idx + word.length + 15);
		return negationRegex.test(beforeContext) || negationRegex.test(afterContext);
	}

	// Few-shot/Example pattern check
	const exampleWords = ["example", "예시", "예제", "few-shot", "유사 사례"];
	const lowerPrompt = prompt.toLowerCase();
	if (exampleWords.some(word => lowerPrompt.includes(word) && !isNegated(lowerPrompt, word))) {
		score += 1;
	}

	// Verification check
	const verifyWords = ["test", "verify", "run", "spec", "assertion", "evidence", "check", "검증", "테스트", "실행"];
	if (verifyWords.some(word => lowerPrompt.includes(word) && !isNegated(lowerPrompt, word))) {
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
		stderr.write(" - 구조화된 XML 태그(<context>, <input>)나 예시 패턴(few-shot)을 명시해 보세요.\n");
		stderr.write(" - 계획이 복잡하다면 모달을 여는 '/grill-me' 계획 인터뷰를 먼저 활용해 보세요.\n\n");
	} else if (finalScore >= 8) {
		stderr.write("\n\x1b[32m[LazyAntigravity] ✨ 프롬프트 밀도가 매우 높습니다 (점수: " + finalScore + "/10).\x1b[0m\n");
		stderr.write("\x1b[32m구조화와 예제가 매우 뛰어납니다. 제미나이의 최고 성능 추론(thinking/high) 모드가 최상의 결과물을 도출할 수 있는 구조입니다.\x1b[0m\n\n");
	}

	exit(0);
}

main();
