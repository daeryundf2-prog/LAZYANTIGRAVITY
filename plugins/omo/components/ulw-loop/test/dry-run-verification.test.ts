import { describe, expect, it } from "vitest";
import { dryRunCmd } from "../src/dry-run.js";

// Mock printJson and process.stdout.write
const mockStdout = {
	output: "",
	write(chunk: string) {
		this.output += chunk;
		return true;
	},
	clear() {
		this.output = "";
	},
};
const originalStdoutWrite = process.stdout.write.bind(process.stdout);

describe("Dry Run: Verification Pipeline", () => {
	it("should simulate quality-happy-path", async () => {
		const logs: string[] = [];
		const origStdoutWrite = process.stdout.write.bind(process.stdout);
		process.stdout.write = (msg: string) => {
			logs.push(msg);
			return true;
		};
		try {
			await dryRunCmd("/fake/root", ["--scenario", "quality-happy-path", "--json"], true);
			const jsonStr = logs.join("");
			const json = JSON.parse(jsonStr);
			expect(json.scenario).toBe("quality-happy-path");
			expect(json.qualityGateTriggered).toBe(true);
			expect(json.qualityStatus).toBe("passed");
			expect(json.eventType).toBe("quality_gate.completed");
			expect(json.wouldFailRun).toBe(false);
			expect(json.parentActionRequired).toBe(false);
		} finally {
			process.stdout.write = origStdoutWrite;
		}
	});

	it("should simulate quality-mechanical-fail", async () => {
		const logs: string[] = [];
		const origStdoutWrite = process.stdout.write.bind(process.stdout);
		process.stdout.write = (msg: string | Uint8Array, cb?: any) => {
			if (typeof msg === 'string') logs.push(msg);
			return true;
		};
		try {
			await dryRunCmd("/fake/root", ["--scenario", "quality-mechanical-fail", "--json"], true);
			const jsonStr = logs.join("");
			const json = JSON.parse(jsonStr);
			expect(json.scenario).toBe("quality-mechanical-fail");
			expect(json.qualityGateTriggered).toBe(true);
			expect(json.qualityStatus).toBe("failed");
			expect(json.qualityStage).toBe("mechanical");
			expect(json.eventType).toBe("quality_gate.failed");
			expect(json.wouldFailRun).toBe(false);
			expect(json.parentActionRequired).toBe(true);
		} finally {
			process.stdout.write = origStdoutWrite;
		}
	});

	it("should simulate quality-semantic-insufficient-evidence", async () => {
		const logs: string[] = [];
		const origStdoutWrite = process.stdout.write.bind(process.stdout);
		process.stdout.write = (msg: string | Uint8Array, cb?: any) => {
			if (typeof msg === 'string') logs.push(msg);
			return true;
		};
		try {
			await dryRunCmd("/fake/root", ["--scenario", "quality-semantic-insufficient-evidence", "--json"], true);
			const jsonStr = logs.join("");
			const json = JSON.parse(jsonStr);
			expect(json.scenario).toBe("quality-semantic-insufficient-evidence");
			expect(json.qualityStatus).toBe("failed");
			expect(json.qualityStage).toBe("semantic");
			expect(json.parentActionRequired).toBe(true);
		} finally {
			process.stdout.write = origStdoutWrite;
		}
	});

	it("should simulate quality-consensus-required", async () => {
		const logs: string[] = [];
		const origStdoutWrite = process.stdout.write.bind(process.stdout);
		process.stdout.write = (msg: string | Uint8Array, cb?: any) => {
			if (typeof msg === 'string') logs.push(msg);
			return true;
		};
		try {
			await dryRunCmd("/fake/root", ["--scenario", "quality-consensus-required", "--json"], true);
			const jsonStr = logs.join("");
			const json = JSON.parse(jsonStr);
			expect(json.scenario).toBe("quality-consensus-required");
			expect(json.qualityStatus).toBe("required");
			expect(json.qualityStage).toBe("consensus");
			expect(json.eventType).toBe("quality_gate.consensus_required");
			expect(json.parentActionRequired).toBe(true);
		} finally {
			process.stdout.write = origStdoutWrite;
		}
	});

	it("should simulate quality-stagnation-unresolved", async () => {
		const logs: string[] = [];
		const origStdoutWrite = process.stdout.write.bind(process.stdout);
		process.stdout.write = (msg: string | Uint8Array, cb?: any) => {
			if (typeof msg === 'string') logs.push(msg);
			return true;
		};
		try {
			await dryRunCmd("/fake/root", ["--scenario", "quality-stagnation-unresolved", "--json"], true);
			const jsonStr = logs.join("");
			const json = JSON.parse(jsonStr);
			expect(json.scenario).toBe("quality-stagnation-unresolved");
			expect(json.qualityStatus).toBe("failed");
			expect(json.qualityStage).toBe("semantic");
			expect(json.parentActionRequired).toBe(true);
		} finally {
			process.stdout.write = origStdoutWrite;
		}
	});
});
