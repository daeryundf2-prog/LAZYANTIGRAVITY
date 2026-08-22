import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
function fingerprint(value) {
    return createHash("sha256").update(value, "utf8").digest("hex");
}
export async function executeHostCommand(request) {
    const startedAt = new Date().toISOString();
    const toolCallId = request.toolCallId ?? randomUUID();
    let stdout = "";
    let stderr = "";
    let exitCode = 0;
    try {
        const result = await execFileAsync(request.command, [...(request.args ?? [])], {
            cwd: request.cwd,
            encoding: "utf8",
            timeout: request.timeoutMs ?? 120_000,
            maxBuffer: request.maxBuffer ?? 1024 * 1024,
            windowsHide: true,
        });
        stdout = result.stdout;
        stderr = result.stderr;
    }
    catch (error) {
        const failure = error;
        stdout = typeof failure.stdout === "string" ? failure.stdout : "";
        stderr = typeof failure.stderr === "string" ? failure.stderr : error instanceof Error ? error.message : String(error);
        exitCode = typeof failure.code === "number" ? failure.code : 1;
    }
    const finishedAt = new Date().toISOString();
    return {
        stdout,
        stderr,
        exitCode,
        binding: {
            requestId: request.requestId,
            runId: request.runId,
            sessionId: request.sessionId,
            toolCallId,
            startedAt,
            finishedAt,
            exitCode,
            stdoutFingerprint: fingerprint(stdout),
            stderrFingerprint: fingerprint(stderr),
        },
    };
}
export function fingerprintOutput(value) {
    return fingerprint(value);
}
