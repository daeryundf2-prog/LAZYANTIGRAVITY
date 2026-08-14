import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const PRIMARY_CHECKPOINTS_REL = join(".omo", "ulw-loop", "checkpoints");
const LEGACY_CHECKPOINTS_REL = join(".lazycodex", "checkpoints");
export function getPrimaryCheckpointsDir(repoRoot) {
    return join(repoRoot, PRIMARY_CHECKPOINTS_REL);
}
export function listCheckpointDirs(repoRoot) {
    return [getPrimaryCheckpointsDir(repoRoot), join(repoRoot, LEGACY_CHECKPOINTS_REL)];
}
export async function saveRoleCheckpoint(repoRoot, data) {
    const checkpointsDir = getPrimaryCheckpointsDir(repoRoot);
    if (!existsSync(checkpointsDir)) {
        await mkdir(checkpointsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString();
    // Replace colons for Windows filename compatibility
    const safeTimestamp = timestamp.replace(/:/g, "-");
    const filename = `${data.dryRun ? "dryrun" : "ulw"}-${safeTimestamp}.json`;
    const filepath = join(checkpointsDir, filename);
    const checkpoint = {
        ...data,
        timestamp,
    };
    await writeFile(filepath, JSON.stringify(checkpoint, null, 2), "utf8");
    return filepath;
}
export async function findLatestRoleCheckpoint(repoRoot) {
    const candidates = [];
    for (const dir of listCheckpointDirs(repoRoot)) {
        if (!existsSync(dir))
            continue;
        const files = await readdir(dir);
        for (const file of files) {
            if (!file.startsWith("ulw-") || !file.endsWith(".json"))
                continue;
            candidates.push({ filepath: join(dir, file), name: file });
        }
    }
    if (candidates.length === 0) {
        return null;
    }
    candidates.sort((a, b) => a.name.localeCompare(b.name));
    const latest = candidates[candidates.length - 1];
    if (!latest) {
        return null;
    }
    const content = await readFile(latest.filepath, "utf8");
    return JSON.parse(content);
}
