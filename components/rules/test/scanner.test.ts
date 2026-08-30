import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { scanRuleFiles } from "../src/rules/scanner.js";

const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("scanRuleFiles", () => {
	it("#given more rule files than max #when scanning #then returns only capped files", () => {
		// given
		const root = mkdtempSync(join(tmpdir(), "codex-rules-scanner-"));
		tempDirectories.push(root);
		for (let index = 0; index < 5; index += 1) {
			writeFileSync(join(root, `rule-${index}.md`), `Rule ${index}\n`);
		}

		// when
		const files = scanRuleFiles({ rootDir: root, maxFiles: 2 });

		// then
		expect(files).toHaveLength(2);
	});

	it("#given rule files and an excluded directory #when scanning #then returns sorted non-excluded files", () => {
		// given
		const root = mkdtempSync(join(tmpdir(), "codex-rules-scanner-"));
		tempDirectories.push(root);
		mkdirSync(join(root, "dist"), { recursive: true });
		writeFileSync(join(root, "beta.md"), "Beta\n");
		writeFileSync(join(root, "alpha.md"), "Alpha\n");
		writeFileSync(join(root, "dist", "ignored.md"), "Ignored\n");

		// when
		const files = scanRuleFiles({ rootDir: root });

		// then
		expect(files.map((file) => file.path)).toEqual([join(root, "alpha.md"), join(root, "beta.md")]);
	});

	it("#given symlink loop #when scanning #then traversal terminates without duplicate files", (ctx) => {
		// given
		const root = mkdtempSync(join(tmpdir(), "codex-rules-scanner-"));
		tempDirectories.push(root);
		const nested = join(root, "nested");
		mkdirSync(nested, { recursive: true });
		writeFileSync(join(root, "root.md"), "Root\n");
		try {
			symlinkSync(root, join(nested, "loop"));
		} catch (err) {
			// Windows에서 symlink 생성은 개발자 모드/권한을 요구한다 — 환경 한계
			// 이지 스캐너 결함이 아니므로 건너뛴다(유닉스 CI에서는 항상 실행).
			if ((err as NodeJS.ErrnoException).code === "EPERM" || (err as NodeJS.ErrnoException).code === "EACCES") {
				return ctx.skip("symlink creation requires privilege on this platform");
			}
			throw err;
		}

		// when
		const files = scanRuleFiles({ rootDir: root });

		// then
		expect(files.map((file) => file.path)).toEqual([join(root, "root.md")]);
	});
});
