import { existsSync, mkdtempSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { appendRunEvent } from "../src/control-plane.js";
import { buildEvidenceDraft } from "../src/evidence-draft.js";
import { validateStrictEvidence } from "../src/evidence-contract.js";
import { verifyEvidenceGroundTruth } from "../src/evidence-verifier.js";

let testDir: string;

afterEach(async () => {
	if (testDir) await rm(testDir, { recursive: true, force: true });
});

describe("evidence-draft", () => {
	it("scaffolds a verified envelope from the ledger that passes ground-truth verification", async () => {
		testDir = mkdtempSync(join(tmpdir(), "evidence-draft-"));
		await mkdir(join(testDir, "src"), { recursive: true });
		await writeFile(join(testDir, "src", "auth.ts"), "export const auth = true;\n", "utf8");
		await appendRunEvent(testDir, "default-run", "agent.completed_reported", {
			result: {
				runId: "default-run",
				agentId: "worker-1",
				role: "worker",
				status: "success",
				summary: "implemented changes",
				filesChanged: ["src/auth.ts"],
				commandsRun: ["npm test"],
				artifactsGenerated: [],
				blockers: [],
				nextRecommendedAction: "checkpoint",
				requiresParentAck: true,
			},
			role: "worker",
		});

		const draft = await buildEvidenceDraft(testDir, "default-run", "G001");

		const validation = validateStrictEvidence(draft.envelope);
		expect(validation.valid).toBe(true);
		const truth = verifyEvidenceGroundTruth(testDir, draft.envelope);
		expect(truth.verified).toBe(true);
		expect(draft.envelope.fileChecksums?.[0]?.file).toBe("src/auth.ts");
		expect(draft.warnings.some((w) => w.includes("commandAudits are placeholders"))).toBe(true);
		expect(existsSync(draft.draftPath)).toBe(true);
	});

	it("warns when claimed files do not exist on disk", async () => {
		testDir = mkdtempSync(join(tmpdir(), "evidence-draft-missing-"));
		await appendRunEvent(testDir, "default-run", "agent.completed_reported", {
			result: {
				runId: "default-run",
				agentId: "worker-1",
				role: "worker",
				status: "success",
				summary: "ghost work",
				filesChanged: ["src/ghost.ts"],
				commandsRun: [],
				artifactsGenerated: [],
				blockers: [],
				nextRecommendedAction: "checkpoint",
				requiresParentAck: true,
			},
			role: "worker",
		});
		const draft = await buildEvidenceDraft(testDir, "default-run");
		expect(draft.envelope.filesChanged).toEqual(["src/ghost.ts"]);
		expect(draft.warnings.some((w) => w.includes("does not exist on disk"))).toBe(true);
	});
});
