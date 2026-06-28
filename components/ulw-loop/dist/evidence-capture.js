import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants, createWriteStream } from "node:fs";
import { access, copyFile, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fileSha256Hex, TRUSTED_EVIDENCE_MANIFEST_KIND, TRUSTED_EVIDENCE_MANIFEST_VERSION, } from "./evidence-manifest.js";
import { UlwLoopError } from "./types.js";
function captureError(message, code, details) {
    throw new UlwLoopError(message, code, { details });
}
function evidenceDir(repoRoot) {
    return resolve(repoRoot, ".omo", "ulw-loop", "evidence");
}
function isInsideOrSame(parentDir, filePath) {
    const rel = relative(parentDir, filePath);
    return rel.length === 0 || (!rel.startsWith("..") && !isAbsolute(rel));
}
function safeName(value) {
    return (basename(value)
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "command");
}
function resolveArtifactPath(repoRoot, args) {
    if (args.output !== undefined)
        return resolve(isAbsolute(args.output) ? args.output : join(repoRoot, args.output));
    const label = safeName(args.command[0] ?? "command");
    return join(evidenceDir(repoRoot), `${label}-${Date.now()}-${randomUUID()}.log`);
}
function isNodeErrorCode(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}
async function realExistingAncestor(path) {
    let current = path;
    const missingSegments = [];
    for (;;) {
        try {
            return join(await realpath(current), ...missingSegments.reverse());
        }
        catch (error) {
            if (!isNodeErrorCode(error, "ENOENT"))
                throw error;
            const parent = dirname(current);
            if (parent === current)
                throw error;
            missingSegments.push(basename(current));
            current = parent;
        }
    }
}
async function trustedEvidenceDir(repoRoot) {
    const requestedDir = evidenceDir(repoRoot);
    const canonicalDir = await realExistingAncestor(requestedDir);
    if (canonicalDir !== requestedDir || !isInsideOrSame(repoRoot, canonicalDir)) {
        return captureError("Capture evidence directory must stay inside this repository.", "ULW_LOOP_CAPTURE_OUTPUT_OUTSIDE_ROOT", {
            path: requestedDir,
            repoRoot,
        });
    }
    await mkdir(requestedDir, { recursive: true });
    const realDir = await realpath(requestedDir);
    if (realDir !== requestedDir || !isInsideOrSame(repoRoot, realDir)) {
        return captureError("Capture evidence directory must stay inside this repository.", "ULW_LOOP_CAPTURE_OUTPUT_OUTSIDE_ROOT", {
            path: requestedDir,
            repoRoot,
        });
    }
    return realDir;
}
async function trustedWritablePath(repoRoot, rawPath) {
    const realRepoRoot = await realpath(repoRoot);
    const allowedDir = await trustedEvidenceDir(realRepoRoot);
    const requestedPath = resolve(rawPath);
    const requestedParent = dirname(requestedPath);
    const canonicalParent = await realExistingAncestor(requestedParent);
    if (!isInsideOrSame(allowedDir, canonicalParent)) {
        return captureError("Capture output must be inside .omo/ulw-loop/evidence.", "ULW_LOOP_CAPTURE_OUTPUT_OUTSIDE_ROOT", {
            path: rawPath,
            evidenceDir: allowedDir,
        });
    }
    await mkdir(canonicalParent, { recursive: true });
    const realParent = await realpath(canonicalParent);
    if (!isInsideOrSame(allowedDir, realParent)) {
        return captureError("Capture output must be inside .omo/ulw-loop/evidence.", "ULW_LOOP_CAPTURE_OUTPUT_OUTSIDE_ROOT", {
            path: rawPath,
            evidenceDir: allowedDir,
        });
    }
    return join(realParent, basename(requestedPath));
}
async function rejectExistingPath(path, label) {
    try {
        await access(path);
    }
    catch (error) {
        if (isNodeErrorCode(error, "ENOENT"))
            return;
        throw error;
    }
    return captureError(`${label} already exists; choose a new capture output path.`, "ULW_LOOP_CAPTURE_OUTPUT_EXISTS", {
        path,
    });
}
async function writeTranscript(args) {
    return new Promise((resolvePromise, reject) => {
        const stream = createWriteStream(args.artifactPath, { flags: "wx" });
        let spawnError = null;
        stream.once("error", reject);
        stream.once("open", () => {
            stream.write(`$ ${args.command.join(" ")}\n`);
            const child = spawn(args.command[0] ?? "", args.command.slice(1), { cwd: args.cwd, env: process.env });
            child.stdout.on("data", (chunk) => stream.write(chunk));
            child.stderr.on("data", (chunk) => stream.write(chunk));
            child.on("error", (error) => {
                spawnError = error;
                stream.write(`\n[ulw-loop capture spawn error] ${error.message}\n`);
            });
            child.on("close", (code, signal) => {
                const exitCode = spawnError === null ? (code ?? 1) : 127;
                stream.write(`\n[ulw-loop capture exitCode=${exitCode}${signal === null ? "" : ` signal=${signal}`}]\n`);
                stream.end(() => resolvePromise({ exitCode, exitSignal: signal }));
            });
        });
    });
}
export async function captureCommandEvidence(repoRoot, args) {
    if (args.command.length === 0) {
        return captureError("Missing capture command after --.", "ULW_LOOP_CAPTURE_COMMAND_REQUIRED", {});
    }
    const cwd = await realpath(repoRoot);
    const artifactPath = await trustedWritablePath(cwd, resolveArtifactPath(cwd, args));
    const manifestPath = await trustedWritablePath(cwd, `${artifactPath}.manifest.json`);
    await rejectExistingPath(artifactPath, "Capture output");
    await rejectExistingPath(manifestPath, "Capture manifest");
    const tempArtifactPath = await trustedWritablePath(cwd, join(dirname(artifactPath), `.${basename(artifactPath)}.${randomUUID()}.tmp`));
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    try {
        const child = await writeTranscript({ artifactPath: tempArtifactPath, command: args.command, cwd });
        await copyFile(tempArtifactPath, artifactPath, constants.COPYFILE_EXCL);
        const endedAtMs = Date.now();
        const manifest = {
            version: TRUSTED_EVIDENCE_MANIFEST_VERSION,
            kind: TRUSTED_EVIDENCE_MANIFEST_KIND,
            command: [...args.command],
            cwd,
            exitCode: child.exitCode,
            exitSignal: child.exitSignal,
            startedAt,
            endedAt: new Date(endedAtMs).toISOString(),
            durationMs: endedAtMs - startedAtMs,
            artifactPath,
            artifactSha256: fileSha256Hex(artifactPath),
            nonce: randomUUID(),
            captureTool: "omo-ulw-loop capture-evidence",
        };
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
        return {
            evidence: pathToFileURL(manifestPath).href,
            artifactPath,
            manifestPath,
            exitCode: child.exitCode,
            manifest,
        };
    }
    finally {
        await rm(tempArtifactPath, { force: true });
    }
}
