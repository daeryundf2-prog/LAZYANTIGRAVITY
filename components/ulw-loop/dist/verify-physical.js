import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { UlwLoopError } from "./types.js";
export function verifyPhysicalEvidence(repoRoot, evidenceStr) {
    const evidenceFileRegex = /(?:\.omo\/evidence\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*|\.omx\/evidence\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*)/g;
    const matches = evidenceStr.match(evidenceFileRegex) || [];
    if (matches.length === 0) {
        throw new UlwLoopError("Always-Grounded Verification: Your evidence must specify a physical artifact path under .omo/evidence/ or .omx/evidence/ (e.g. EVIDENCE_RECORDED: .omo/evidence/...). Plain text descriptions are not accepted.", "ulw_loop_verification_missing_physical_file");
    }
    // 2. Physically check if each referenced file exists and is non-empty
    for (const match of matches) {
        const absolutePath = resolve(repoRoot, match);
        if (!existsSync(absolutePath)) {
            throw new UlwLoopError(`Always-Grounded Verification: The specified evidence file "${match}" does not exist on disk. You must perform the verification and save the output to this file first.`, "ulw_loop_verification_file_not_found");
        }
        const stat = statSync(absolutePath);
        if (stat.size <= 0) {
            throw new UlwLoopError(`Always-Grounded Verification: The specified evidence file "${match}" is empty. Verification files must contain non-empty output logs/reports.`, "ulw_loop_verification_file_empty");
        }
    }
    // 3. If code changes occurred, verify that the evidence content or the file contents contain a test run indicator showing tests passed.
    let gitStatus = "";
    try {
        gitStatus = execSync("git status --porcelain", { cwd: repoRoot, encoding: "utf8" }).trim();
    }
    catch {
        // Ignore git failures (e.g. not a git repo)
    }
    if (gitStatus) {
        const modifiedSourceFiles = gitStatus
            .split("\n")
            .map(line => line.slice(3).trim())
            .filter(file => {
            const ext = file.split(".").pop() || "";
            const isSource = ["ts", "tsx", "go", "py", "rs"].includes(ext);
            // Exclude tests, configs, .omo, .omx, node_modules, etc.
            const isNotTestOrConfig = !file.includes("test/") &&
                !file.includes("tests/") &&
                !file.includes(".test.") &&
                !file.includes(".spec.") &&
                !file.includes(".omo/") &&
                !file.includes(".omx/") &&
                !file.includes("node_modules/");
            return isSource && isNotTestOrConfig;
        });
        if (modifiedSourceFiles.length > 0) {
            // Code changes occurred! Read all evidence file contents
            let combinedContent = evidenceStr;
            for (const match of matches) {
                const absolutePath = resolve(repoRoot, match);
                try {
                    combinedContent += "\n" + readFileSync(absolutePath, "utf8");
                }
                catch {
                    // Ignore read errors
                }
            }
            // Verify test passing indicator in the combined content
            const testFilePattern = /(?:test|spec|suite|_test\.go|\.test\.ts|\.spec\.ts)/i;
            const testPassPattern = /(?:pass|ok|✔|test result: ok)/i;
            if (!testFilePattern.test(combinedContent) || !testPassPattern.test(combinedContent)) {
                throw new UlwLoopError(`Always-Grounded Verification: Code changes were detected in source files (${modifiedSourceFiles.join(", ")}). You must run the corresponding unit tests and include the test execution logs/reports in the evidence.`, "ulw_loop_verification_test_logs_missing");
            }
        }
    }
}
