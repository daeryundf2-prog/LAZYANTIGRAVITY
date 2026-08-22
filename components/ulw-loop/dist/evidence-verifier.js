import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
export function computeFileSha256(filePath) {
    try {
        if (!existsSync(filePath))
            return null;
        const content = readFileSync(filePath);
        return createHash("sha256").update(content).digest("hex");
    }
    catch {
        return null;
    }
}
export function countFileLines(filePath) {
    try {
        if (!existsSync(filePath))
            return null;
        const content = readFileSync(filePath, "utf8");
        return content.split("\n").length;
    }
    catch {
        return null;
    }
}
export function verifyEvidenceGroundTruth(repoRoot, evidence, events) {
    const mismatchedFiles = [];
    const invalidLineRanges = [];
    const nonZeroExitCommands = [];
    const root = resolve(repoRoot);
    const isInsideRoot = (targetPath) => {
        const rel = relative(root, targetPath);
        return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
    };
    // 1. Verify readRanges against actual disk files and valid line numbers
    if (evidence.readRanges && evidence.readRanges.length > 0) {
        for (const range of evidence.readRanges) {
            const targetPath = isAbsolute(range.file) ? resolve(range.file) : resolve(root, range.file);
            if (!isInsideRoot(targetPath)) {
                mismatchedFiles.push(`Evidence path escapes repository root: ${range.file}`);
                continue;
            }
            if (!existsSync(targetPath)) {
                mismatchedFiles.push(`Missing referenced file in readRanges: ${range.file}`);
                continue;
            }
            const totalLines = countFileLines(targetPath);
            if (totalLines !== null) {
                if (range.startLine !== undefined && (range.startLine < 1 || range.startLine > totalLines)) {
                    invalidLineRanges.push(`Invalid startLine ${range.startLine} for file ${range.file} (total lines: ${totalLines})`);
                }
                if (range.endLine !== undefined && (range.endLine < 1 || range.endLine > totalLines)) {
                    invalidLineRanges.push(`Invalid endLine ${range.endLine} for file ${range.file} (total lines: ${totalLines})`);
                }
                if (range.startLine !== undefined && range.endLine !== undefined && range.startLine > range.endLine) {
                    invalidLineRanges.push(`startLine ${range.startLine} exceeds endLine ${range.endLine} for file ${range.file}`);
                }
            }
        }
    }
    // 2. Verify fileChecksums if provided against real disk SHA-256
    if (evidence.fileChecksums && evidence.fileChecksums.length > 0) {
        for (const checksum of evidence.fileChecksums) {
            const targetPath = isAbsolute(checksum.file) ? resolve(checksum.file) : resolve(root, checksum.file);
            if (!isInsideRoot(targetPath)) {
                mismatchedFiles.push(`Checksum path escapes repository root: ${checksum.file}`);
                continue;
            }
            const actualSha = computeFileSha256(targetPath);
            if (!actualSha) {
                mismatchedFiles.push(`Cannot compute hash for missing file: ${checksum.file}`);
            }
            else if (actualSha !== checksum.sha256) {
                mismatchedFiles.push(`SHA-256 mismatch for ${checksum.file}: expected ${checksum.sha256}, got ${actualSha}`);
            }
        }
    }
    // 3. Verify command execution audits (must be exitCode 0 if recorded)
    if (evidence.commandAudits && evidence.commandAudits.length > 0) {
        const auditedCommands = new Set(evidence.commandAudits.map((audit) => audit.command));
        for (const command of evidence.commandsRun ?? []) {
            if (!auditedCommands.has(command))
                nonZeroExitCommands.push(`Missing command audit for "${command}"`);
        }
        for (const audit of evidence.commandAudits) {
            if (audit.exitCode !== 0) {
                nonZeroExitCommands.push(`Command "${audit.command}" exited with non-zero code ${audit.exitCode}`);
            }
            if (audit.stdoutFingerprint !== undefined && !/^[a-f0-9]{64}$/i.test(audit.stdoutFingerprint)) {
                nonZeroExitCommands.push(`Invalid stdout fingerprint for "${audit.command}"`);
            }
            if (audit.stderrFingerprint !== undefined && !/^[a-f0-9]{64}$/i.test(audit.stderrFingerprint)) {
                nonZeroExitCommands.push(`Invalid stderr fingerprint for "${audit.command}"`);
            }
        }
    }
    // 4. Cross-check against ledger completed events if provided
    if (events && events.length > 0) {
        const completedEvent = events.find((e) => e.type === "agent.completed_reported");
        if (completedEvent?.result && typeof completedEvent.result === "object") {
            const subResult = completedEvent.result;
            const subCommands = Array.isArray(subResult["commandsRun"]) ? subResult["commandsRun"] : [];
            if (evidence.commandsRun && evidence.commandsRun.length > 0 && subCommands.length > 0) {
                const hasOverlap = evidence.commandsRun.some((cmd) => subCommands.includes(cmd));
                if (!hasOverlap && evidence.status === "verified") {
                    nonZeroExitCommands.push("Evidence commandsRun does not match any commands recorded in agent completed event");
                }
            }
        }
    }
    const hasErrors = mismatchedFiles.length > 0 || invalidLineRanges.length > 0 || nonZeroExitCommands.length > 0;
    if (hasErrors) {
        const errorParts = [];
        if (mismatchedFiles.length > 0)
            errorParts.push(`Files: ${mismatchedFiles.join("; ")}`);
        if (invalidLineRanges.length > 0)
            errorParts.push(`Lines: ${invalidLineRanges.join("; ")}`);
        if (nonZeroExitCommands.length > 0)
            errorParts.push(`Commands: ${nonZeroExitCommands.join("; ")}`);
        return {
            verified: false,
            error: `Fabricated or inconsistent evidence detected: ${errorParts.join(" | ")}`,
            mismatchedFiles,
            invalidLineRanges,
            nonZeroExitCommands,
        };
    }
    return { verified: true };
}
