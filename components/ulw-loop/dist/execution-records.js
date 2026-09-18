import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getRunDir } from "./control-plane.js";
export function executionCommand(command, args) {
    return [command, ...args].map((part) => (/^[\w./:@=-]+$/.test(part) ? part : JSON.stringify(part))).join(" ");
}
function recordPath(repoRoot, binding) {
    const key = createHash("sha256")
        .update(JSON.stringify([binding.requestId, binding.sessionId, binding.toolCallId]))
        .digest("hex");
    return join(getRunDir(repoRoot, binding.runId), "executions", `${key}.json`);
}
export function persistExecutionRecord(record) {
    const path = recordPath(record.workspaceRoot, record.binding);
    mkdirSync(join(path, ".."), { recursive: true, mode: 0o700 });
    writeFileSync(path, JSON.stringify(record), { encoding: "utf8", mode: 0o600, flag: "wx" });
}
export function verifyExecutionRecords(repoRoot, evidence) {
    const errors = [];
    const commands = evidence.commandsRun ?? [];
    const audits = evidence.commandAudits ?? [];
    if (!commands.length && !audits.length && !evidence.executionBinding)
        return errors;
    const binding = evidence.executionBinding;
    if (!binding)
        return ["Missing trusted execution binding"];
    const check = (candidate, command) => {
        try {
            const record = JSON.parse(readFileSync(recordPath(repoRoot, candidate), "utf8"));
            return (record.workspaceRoot === realpathSync(repoRoot) &&
                candidate.runId === binding.runId &&
                candidate.sessionId === binding.sessionId &&
                Object.keys(record.binding).length === Object.keys(candidate).length &&
                Object.keys(record.binding).every((key) => record.binding[key] === candidate[key]) &&
                candidate.exitCode === 0 &&
                Number.isFinite(Date.parse(candidate.startedAt)) &&
                Date.parse(candidate.finishedAt) >= Date.parse(candidate.startedAt) &&
                [candidate.stdoutFingerprint, candidate.stderrFingerprint].every((value) => /^[a-f0-9]{64}$/.test(value) && !/^0+$/.test(value)) &&
                (command === undefined || record.commandFingerprint === createHash("sha256").update(command).digest("hex")));
        }
        catch {
            return false;
        }
    };
    if (!check(binding))
        errors.push("Execution binding does not match a trusted host execution record");
    for (const command of commands) {
        if (!audits.some((audit) => audit.command === command))
            errors.push(`Missing command audit for "${command}"`);
    }
    for (const audit of audits) {
        const candidate = audit.executionBinding ?? binding;
        if (!check(candidate, audit.command) ||
            audit.exitCode !== candidate.exitCode ||
            (audit.stdoutFingerprint !== undefined && audit.stdoutFingerprint !== candidate.stdoutFingerprint) ||
            (audit.stderrFingerprint !== undefined && audit.stderrFingerprint !== candidate.stderrFingerprint)) {
            errors.push(`Command "${audit.command}" does not match its trusted execution result`);
        }
    }
    return errors;
}
