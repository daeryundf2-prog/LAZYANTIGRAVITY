import { aggregateConsensus } from "./consensus-aggregate.js";
import { reportConsensusResult } from "./consensus-dispatch.js";
import { validateConsensusSchema } from "./consensus-helpers.js";
import { MockLiveConsensusClient, mockSessionToPersona } from "./consensus-mock-client.js";
import type { LiveConsensusClient } from "./consensus-types.js";
import { ALL_PERSONAS, CONSENSUS_RESULT_SCHEMA } from "./consensus-types.js";
import { validateConsensusResultEnvelope } from "./verification-pipeline.js";
import type { ConsensusPersona, ConsensusResultEnvelope } from "./verification-pipeline-types.js";

export { aggregateConsensus } from "./consensus-aggregate.js";
export { dispatchConsensus, reportConsensusResult } from "./consensus-dispatch.js";
export { getEnvelopeHash, validateConsensusSchema } from "./consensus-helpers.js";
export { MockLiveConsensusClient, setMockPersonaVerdict } from "./consensus-mock-client.js";
export { OpenCodeLiveConsensusClient } from "./consensus-opencode-client.js";
export type { DispatchConsensusOptions, LiveConsensusClient } from "./consensus-types.js";
export { ALL_PERSONAS, CONSENSUS_RESULT_SCHEMA } from "./consensus-types.js";

function getPersonaSystemPrompt(
	persona: ConsensusPersona,
	runId: string,
	consensusId: string,
	agentId: string,
): string {
	let details = "";
	if (persona === "advocate") {
		details =
			"옹호자(Advocate): 제시된 코드 변경안의 가치, 기대 효과, 올바른 아키텍처적 선택을 긍정적인 관점에서 분석하십시오.";
	} else if (persona === "devils_advocate") {
		details =
			"반대자(Devil's Advocate): 제시된 코드 변경안의 잠재적 리스크, 예외 상황에서의 오작동 가능성, 설계적 허점을 날카롭게 분석하십시오.";
	} else if (persona === "regression_reviewer") {
		details =
			"회귀 분석자(Regression Reviewer): 기존 기능과의 호환성, 기존 테스트나 성능에 미칠 부작용, 예기치 못한 사이드 이펙트를 검증하십시오.";
	} else if (persona === "security_state_reviewer") {
		details =
			"보안 및 상태 분석자(Security-State Reviewer): 보안 취약점, 민감 정보 유출 우려, 동시성 또는 일관성 깨짐 결함을 검증하십시오.";
	}

	return `당신은 코드 변경 사항의 합의를 위해 소집된 다중 페르소나 합의 패널의 일원입니다.
당신이 맡은 페르소나는 다음과 같습니다:
[역할] ${details}

합의를 위해 제시된 프롬프트를 주의 깊게 검토한 후, 분석 의견과 최종 판정(verdict)을 제출하십시오.

[작성 및 출력 형식 지침]
1. 당신의 분석 내용과 이유를 명확하게 작성하십시오.
2. 분석 작성을 마친 후, 메시지의 **맨 마지막 줄**에 반드시 아래 명시된 JSON 객체 하나만 포함하십시오.
3. 최종 출력 형식은 반드시 아래 구조의 단일 JSON 객체여야 합니다.

JSON 구조:
\`\`\`json
{
  "runId": "${runId}",
  "consensusId": "${consensusId}",
  "agentId": "${agentId}",
  "persona": "${persona}",
  "verdict": "approve" | "reject" | "needs_rework" | "inconclusive",
  "reason": "여기에 판정에 대한 상세한 핵심 이유 기재",
  "requiresParentAck": true
}
\`\`\`

[주의사항]
- verdict는 반드시 'approve', 'reject', 'needs_rework', 'inconclusive' 중 하나만 사용해야 합니다.
- 절대 'mayFinalizeRun', 'mayChangeModel', 'wouldSwitchModel'과 같은 속성을 추가하거나 true로 채워선 안 됩니다. (Consensus subagent는 전체 실행을 완료하거나 모델을 직접 변경할 권한이 없습니다.)
- 'completed the whole task', 'run completed', 'finalize run'과 같이 Parent가 실행을 완료 처리하도록 트리거하는 금지된 문구(Forbidden Phrases)를 사용하지 마십시오.
- JSON 이외의 텍스트가 섞이더라도, 맨 마지막 단락은 \`\`\`json ... \`\`\` 마크다운 또는 순수 JSON 텍스트 블록으로 끝나야 합니다.`;
}

export async function triggerLiveConsensus(
	repoRoot: string,
	runId: string,
	consensusId: string,
	prompt: string,
	voterTimeoutMs: number,
	consensusTimeoutMs: number,
	_qualityInputFingerprint?: string,
	client?: LiveConsensusClient,
): Promise<void> {
	const activeClient = client || new MockLiveConsensusClient(runId, consensusId);
	const isMockLive = activeClient instanceof MockLiveConsensusClient;

	const promises = ALL_PERSONAS.map(async (persona) => {
		const agentId = `${persona}-${consensusId.substring(0, 8)}`;
		let sessionId = agentId;

		let durationCreateSessionMs = 0;
		let durationSendMessageMs = 0;
		let durationPollMs = 0;

		try {
			const startCreate = Date.now();
			const createdId = await activeClient.createSession(runId, `consensus voter (${persona})`);
			durationCreateSessionMs = Date.now() - startCreate;
			sessionId = createdId;

			if (isMockLive) {
				mockSessionToPersona[sessionId] = persona;
			}

			const systemPrompt = getPersonaSystemPrompt(persona, runId, consensusId, sessionId);
			const fullPrompt = `${systemPrompt}\n\n[합의 대상 프롬프트]\n${prompt}`;

			const startSend = Date.now();
			await activeClient.sendMessage(sessionId, fullPrompt, CONSENSUS_RESULT_SCHEMA);
			durationSendMessageMs = Date.now() - startSend;

			const startPoll = Date.now();
			const { text, structuredOutput } = await activeClient.pollMessages(sessionId, voterTimeoutMs);
			durationPollMs = Date.now() - startPoll;

			let parsedEnvelope: ConsensusResultEnvelope | null = null;
			let schemaValidationError: Error | null = null;

			if (structuredOutput) {
				try {
					validateConsensusSchema(structuredOutput as Record<string, unknown>);
					parsedEnvelope = structuredOutput as unknown as ConsensusResultEnvelope;
				} catch (err: unknown) {
					schemaValidationError = err instanceof Error ? err : new Error(String(err));
				}
			}

			if (!parsedEnvelope) {
				const jsonBlockRegex = /\{[\s\S]*\}/;
				const match = text.match(jsonBlockRegex);
				if (!match) {
					throw (
						schemaValidationError ||
						new Error("No JSON block found in agent response and structured output was missing or invalid")
					);
				}
				try {
					const textEnvelope: unknown = JSON.parse(match[0]);
					validateConsensusSchema(textEnvelope as Record<string, unknown>);
					parsedEnvelope = textEnvelope as ConsensusResultEnvelope;
				} catch (err: unknown) {
					throw schemaValidationError || (err instanceof Error ? err : new Error(String(err)));
				}
			}

			const envelope = validateConsensusResultEnvelope(parsedEnvelope, runId, consensusId);

			await reportConsensusResult(repoRoot, runId, consensusId, sessionId, envelope, isMockLive, {
				durationCreateSessionMs,
				durationSendMessageMs,
				durationPollMs,
			});
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			const fallbackEnvelope: ConsensusResultEnvelope = {
				runId,
				consensusId,
				agentId: sessionId,
				persona,
				verdict: "inconclusive",
				reason: `Live execution failed: ${msg}`,
				requiresParentAck: true,
			};

			try {
				await reportConsensusResult(repoRoot, runId, consensusId, sessionId, fallbackEnvelope, isMockLive, {
					durationCreateSessionMs,
					durationSendMessageMs,
					durationPollMs,
				});
			} catch {
				// Ignore double failure
			}
		}
	});

	const timeoutPromise = new Promise<void>((_, reject) => {
		setTimeout(() => reject(new Error("consensus_timeout")), consensusTimeoutMs);
	});

	try {
		await Promise.race([Promise.all(promises), timeoutPromise]);
	} catch (err: unknown) {
		if (err instanceof Error && err.message !== "consensus_timeout") {
			throw err;
		}
	}

	await aggregateConsensus(repoRoot, runId, consensusId);
}
