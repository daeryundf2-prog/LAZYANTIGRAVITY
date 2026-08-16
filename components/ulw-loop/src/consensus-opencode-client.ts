import type { LiveConsensusClient } from "./consensus-types.js";

export interface OpencodeSdkClient {
	session: {
		create(opts: { body: { parentID: string; title: string } }): Promise<{ data?: { id?: string }; id?: string }>;
		prompt(opts: {
			path: { id: string };
			body: { parts: Array<{ type: string; text: string }>; json_schema: Record<string, unknown> };
		}): Promise<void>;
		message(opts: { path: { id: string }; body: { parts: Array<{ type: string; text: string }> } }): Promise<void>;
		messages(opts: { path: { id: string } }): Promise<Record<string, unknown>>;
		status(): Promise<Record<string, unknown>>;
	};
}

interface SdkMessage {
	info?: { role?: string };
	role?: string;
	parts?: Array<{ type?: string; text?: string }>;
	structured_output?: Record<string, unknown>;
	structuredOutput?: Record<string, unknown>;
	result?: Record<string, unknown>;
}

export class OpenCodeLiveConsensusClient implements LiveConsensusClient {
	private client!: OpencodeSdkClient;
	constructor(private baseUrl: string) {}

	async init(): Promise<void> {
		const sdkModule = "@opencode-ai/sdk";
		const sdk = (await import(sdkModule)) as {
			createOpencodeClient?: (opts: { baseUrl: string }) => OpencodeSdkClient;
			createOpencode?: (opts: { baseUrl: string }) => OpencodeSdkClient;
			createClient?: (opts: { baseUrl: string }) => OpencodeSdkClient;
		};
		if (typeof sdk.createOpencodeClient === "function") {
			this.client = sdk.createOpencodeClient({ baseUrl: this.baseUrl });
		} else if (typeof sdk.createOpencode === "function") {
			this.client = sdk.createOpencode({ baseUrl: this.baseUrl });
		} else if (typeof sdk.createClient === "function") {
			this.client = sdk.createClient({ baseUrl: this.baseUrl });
		} else {
			throw new Error("No client factory function found in @opencode-ai/sdk");
		}
	}

	async createSession(runId: string, title: string): Promise<string> {
		const res = await this.client.session.create({ body: { parentID: runId, title } });
		const id = res?.data?.id || res?.id;
		if (!id) {
			throw new Error("Failed to create subagent session - no session ID returned");
		}
		return id;
	}

	async sendMessage(sessionId: string, text: string, schema?: Record<string, unknown>): Promise<void> {
		if (typeof this.client.session.prompt === "function" && schema) {
			await this.client.session.prompt({
				path: { id: sessionId },
				body: { parts: [{ type: "text", text }], json_schema: schema },
			});
		} else {
			await this.client.session.message({
				path: { id: sessionId },
				body: { parts: [{ type: "text", text }] },
			});
		}
	}

	async pollMessages(
		sessionId: string,
		timeoutMs: number,
	): Promise<{ text: string; structuredOutput?: Record<string, unknown> }> {
		return waitForResult(this.client, sessionId, timeoutMs);
	}
}

function getLatestAssistantMessage(messages: SdkMessage[]): SdkMessage | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (!msg) continue;
		const role = msg.info?.role || msg.role;
		if (role === "assistant") {
			return msg;
		}
	}
	return null;
}

function extractMsgText(msg: SdkMessage): string {
	if (msg?.parts) {
		return msg.parts
			.filter((part) => part.type === "text" || typeof part.text === "string")
			.map((part) => part.text ?? "")
			.join("\n")
			.trim();
	}
	return "";
}

async function waitForResult(
	client: OpencodeSdkClient,
	sessionId: string,
	timeoutMs: number,
): Promise<{ text: string; structuredOutput?: Record<string, unknown> }> {
	const start = Date.now();
	const pollIntervalMs = 1500;
	const stableRequired = 2;
	let lastMsgCount = 0;
	let stablePolls = 0;

	while (Date.now() - start < timeoutMs) {
		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

		let isIdle = false;
		try {
			if (typeof client.session.status === "function") {
				const statusResult = await client.session.status();
				const statusMap = (statusResult["data"] ?? statusResult) as Record<string, { type: string }>;
				const sessionStatus = statusMap?.[sessionId];
				if (sessionStatus && sessionStatus.type === "idle") {
					isIdle = true;
				}
			}
		} catch {
			isIdle = true;
		}

		try {
			const messagesResult = await client.session.messages({ path: { id: sessionId } });
			const raw = messagesResult["data"] ?? messagesResult;
			const messages: SdkMessage[] = Array.isArray(raw) ? raw : [];
			if (messages.length > 0) {
				if (messages.length === lastMsgCount) {
					stablePolls++;
					if (stablePolls >= stableRequired || isIdle) {
						const lastMsg = getLatestAssistantMessage(messages);
						if (lastMsg) {
							const text = extractMsgText(lastMsg);
							const structuredOutput = lastMsg.structured_output || lastMsg.structuredOutput || lastMsg.result;
							return structuredOutput ? { text, structuredOutput } : { text };
						}
					}
				} else {
					stablePolls = 0;
					lastMsgCount = messages.length;
				}
			}
		} catch {
			// Ignore error and retry
		}
	}
	throw new Error(`voter timed out after ${timeoutMs}ms`);
}
