export class OpenCodeLiveConsensusClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
    async init() {
        const sdkModule = "@opencode-ai/sdk";
        const sdk = (await import(sdkModule));
        if (typeof sdk.createOpencodeClient === "function") {
            this.client = sdk.createOpencodeClient({ baseUrl: this.baseUrl });
        }
        else if (typeof sdk.createOpencode === "function") {
            this.client = sdk.createOpencode({ baseUrl: this.baseUrl });
        }
        else if (typeof sdk.createClient === "function") {
            this.client = sdk.createClient({ baseUrl: this.baseUrl });
        }
        else {
            throw new Error("No client factory function found in @opencode-ai/sdk");
        }
    }
    async createSession(runId, title) {
        const res = await this.client.session.create({ body: { parentID: runId, title } });
        const id = res?.data?.id || res?.id;
        if (!id) {
            throw new Error("Failed to create subagent session - no session ID returned");
        }
        return id;
    }
    async sendMessage(sessionId, text, schema) {
        if (typeof this.client.session.prompt === "function" && schema) {
            await this.client.session.prompt({
                path: { id: sessionId },
                body: { parts: [{ type: "text", text }], json_schema: schema },
            });
        }
        else {
            await this.client.session.message({
                path: { id: sessionId },
                body: { parts: [{ type: "text", text }] },
            });
        }
    }
    async pollMessages(sessionId, timeoutMs) {
        return waitForResult(this.client, sessionId, timeoutMs);
    }
}
function getLatestAssistantMessage(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (!msg)
            continue;
        const role = msg.info?.role || msg.role;
        if (role === "assistant") {
            return msg;
        }
    }
    return null;
}
function extractMsgText(msg) {
    if (msg?.parts) {
        return msg.parts
            .filter((part) => part.type === "text" || typeof part.text === "string")
            .map((part) => part.text ?? "")
            .join("\n")
            .trim();
    }
    return "";
}
async function waitForResult(client, sessionId, timeoutMs) {
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
                const statusMap = (statusResult["data"] ?? statusResult);
                const sessionStatus = statusMap?.[sessionId];
                if (sessionStatus && sessionStatus.type === "idle") {
                    isIdle = true;
                }
            }
        }
        catch {
            isIdle = true;
        }
        try {
            const messagesResult = await client.session.messages({ path: { id: sessionId } });
            const raw = messagesResult["data"] ?? messagesResult;
            const messages = Array.isArray(raw) ? raw : [];
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
                }
                else {
                    stablePolls = 0;
                    lastMsgCount = messages.length;
                }
            }
        }
        catch {
            // Ignore error and retry
        }
    }
    throw new Error(`voter timed out after ${timeoutMs}ms`);
}
