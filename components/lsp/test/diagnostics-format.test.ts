import { describe, expect, it } from "vitest";

import { formatDiagnosticsText } from "../src/diagnostics-format.js";

describe("formatDiagnosticsText", () => {
	it("maps a clean JSON envelope to the silent marker", () => {
		const json = JSON.stringify({ ok: true, filePath: "a.ts", diagnostics: [], total: 0, toolAvailable: true });
		expect(formatDiagnosticsText(json)).toBe("No diagnostics found");
	});

	it("passes through the unavailable note so the hook can skip it", () => {
		const json = JSON.stringify({
			ok: true,
			filePath: "a.ts",
			diagnostics: [],
			total: 0,
			toolAvailable: false,
			toolNote: "TypeScript compiler (tsc) NOT INSTALLED; diagnostics were not run.",
		});
		const out = formatDiagnosticsText(json);
		expect(out).toContain("NOT INSTALLED");
	});

	it("extracts bare diagnostic lines from the envelope", () => {
		const json = JSON.stringify({
			ok: true,
			filePath: "a.ts",
			diagnostics: [{ message: "a.ts(1,7): error TS2304: Cannot find name 'x'" }],
			total: 1,
			toolAvailable: true,
		});
		expect(formatDiagnosticsText(json)).toBe("a.ts(1,7): error TS2304: Cannot find name 'x'");
	});

	it("leaves non-JSON text unchanged", () => {
		expect(formatDiagnosticsText("error TS2304 at 1:1")).toBe("error TS2304 at 1:1");
	});
});
