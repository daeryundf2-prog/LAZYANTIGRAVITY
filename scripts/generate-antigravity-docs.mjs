#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const catalog = JSON.parse(readFileSync(join(root, "config/antigravity-skills.json"), "utf8"));
const modes = JSON.parse(readFileSync(join(root, "config/experimental-skill-modes.json"), "utf8"));
const coreNames = catalog.core.map(({ name }) => `\`${name}\``).join(", ");

function fail(message) {
	throw new Error(message);
}

function experimentalGuide(korean) {
	const title = korean ? "LAZYANTIGRAVITY 실험 스킬 상태" : "LAZYANTIGRAVITY experimental skill status";
	const warning = korean
		? "**복사하지 마십시오. 먼저 저장소에 체크인된 fixture를 포팅하고 변경해야 합니다.** 현재 19개 항목은 IDE와 CLI 모두 지원되지 않습니다."
		: "**DO NOT COPY. Port and change the checked-in fixture first.** All 19 entries are unsupported in both IDE and CLI modes.";
	const headers = korean ? "| 이름 | IDE | CLI | 고정 사유 |" : "| Name | IDE | CLI | Pinned reason |";
	const rows = catalog.experimental.map(({ name, reason }) => {
		const mode = modes[name];
		if (!mode || mode.ide !== "unsupported" || mode.cli !== "unsupported") fail(`mode drift: ${name}`);
		return `<!-- skill:${name} -->\n| \`${name}\` | ${mode.ide} | ${mode.cli} | ${reason} |`;
	}).join("\n");
	const appendix = korean ? `## 향후에만 사용할 수 있는 대상 경로\n\n아래 경로는 고정 계약에 기록된 향후 후보일 뿐입니다. 현재 19개 중 이 경로로 복사할 자격을 충족한 항목은 없습니다.\n\n- IDE workspace: \`<workspace>/.agents/skills/<skill-folder>/\`\n- IDE global: \`~/.gemini/config/skills/<skill-folder>/\`\n- CLI workspace: \`<workspace>/.agents/skills/<skill-name>.md\`\n- CLI global: \`~/.gemini/antigravity-cli/skills/<skill-name>.md\`\n`
		: `## Future-only eligible destinations\n\nThese are pinned future candidates, not current installation instructions. None of the current 19 entries is eligible to be copied to these locations.\n\n- IDE workspace: \`<workspace>/.agents/skills/<skill-folder>/\`\n- IDE global: \`~/.gemini/config/skills/<skill-folder>/\`\n- CLI workspace: \`<workspace>/.agents/skills/<skill-name>.md\`\n- CLI global: \`~/.gemini/antigravity-cli/skills/<skill-name>.md\`\n`;
	return `# ${title}\n\n${warning}\n\n${headers}\n|---|---|---|---|\n${rows}\n\n${appendix}\n[${korean ? "메인 문서" : "Main documentation"}](../README.md)\n`;
}

const rootReadme = `# LAZYANTIGRAVITY\n\nLAZYANTIGRAVITY is a dependency-free local package being adapted to the pinned Google Antigravity contracts in this repository. Its current status is deliberately narrower than earlier documentation claimed.\n\n## Verified surface\n\n- **15 active skills:** ${coreNames}.\n- **19 experimental skills are currently unsupported** in both IDE and CLI modes. See the [English status guide](docs/experimental-skills.md) or [Korean status guide](docs/experimental-skills.ko.md).\n- **2 official hooks:** \`PreInvocation\` and \`Stop\`.\n- **3 local MCP servers:** \`database\`, \`git-bash\`, and \`lsp\`.\n- **Runtime:** Node.js >=20.17. The root package has no runtime or development dependencies.\n\n## Verification boundary\n\nThe validator produced four staged layouts with identical package bytes and exercised real hook and MCP processes. IDE rule parity remains unverified for those four staged layouts. Hosted CI execution, CLI live installation, and IDE live loading are unavailable in the current evidence. A real SQLite executable was unavailable; the database surface is limited to guarded local, read-only SQLite behavior and its unavailable path.\n\nThis package is usable for local evaluation and staged process verification. It is not proven for live installation or production deployment. Read the [evidence-backed scorecard](docs/scorecard.md) before deciding whether it fits your use case.\n\n## Local verification\n\nPrerequisite: Node.js >=20.17. Run from a clean copy of this repository:\n\n\`\`\`sh\nnode scripts/validate-root-toolchain.mjs\nnode scripts/generate-antigravity-docs.mjs --check\nnode scripts/generate-antigravity-score.mjs --check\nnode scripts/validate-antigravity-distribution.mjs\n\`\`\`\n\nThe final command stages disposable copies and validates them; it does not establish that Antigravity loaded a live installation.\n\n## Documentation\n\n- [English detailed guide](src/README.md)\n- [한국어 상세 가이드](src/README.ko.md)\n- [Experimental skills — English](docs/experimental-skills.md)\n- [실험 스킬 — 한국어](docs/experimental-skills.ko.md)\n- [Evidence-backed scorecard](docs/scorecard.md)\n\n## License\n\n[MIT](LICENSE.md)\n`;

const english = `# LAZYANTIGRAVITY — verified guide\n\n[Main README](../README.md) · [한국어](README.ko.md) · [Scorecard](../docs/scorecard.md)\n\n## What is active\n\nThe checked-in catalog exposes 15 active skills: ${coreNames}. The package registers 2 official hooks (\`PreInvocation\`, \`Stop\`) and 3 local MCP servers (\`database\`, \`git-bash\`, \`lsp\`). Node.js >=20.17 is required.\n\nThe [19 experimental skills](../docs/experimental-skills.md) are unsupported in both available modes. Do not copy them into an Antigravity location without first porting and changing the checked-in fixture and then adding fresh evidence.\n\n## What was exercised\n\nA disposable staged validator created four byte-identical package layouts and drove the hook and MCP processes. The result establishes staged-process behavior only. Rule parity remains unverified across the four staged layouts. CLI and IDE live loading were unavailable, hosted execution has no fresh receipt, and real SQLite was unavailable.\n\n## Reproduce locally\n\n\`\`\`sh\nnode scripts/validate-root-toolchain.mjs\nnode scripts/generate-antigravity-docs.mjs --check\nnode scripts/generate-antigravity-score.mjs --check\nnode scripts/validate-antigravity-distribution.mjs\n\`\`\`\n\nUse an isolated copy when reviewing an untrusted change. The staged validator uses temporary locations and reports cleanup; it is not a live-install command.\n\n## Decision\n\nUse this repository for local evaluation and staged process verification. Do not treat it as proven for live installation or production deployment until fresh CLI, IDE, hosted, and SQLite evidence exists.\n`;

const korean = `# LAZYANTIGRAVITY — 검증 범위 안내\n\n+[메인 README](../README.md) · [English](README.md) · [점수표](../docs/scorecard.md)\n\n## 현재 활성 범위\n\n체크인된 카탈로그에는 15 active skills가 있습니다: ${coreNames}. 패키지는 2 official hooks(\`PreInvocation\`, \`Stop\`)와 3 local MCP servers(\`database\`, \`git-bash\`, \`lsp\`)를 등록합니다. Node.js >=20.17이 필요합니다.\n\n[19 experimental skills](../docs/experimental-skills.ko.md)는 IDE와 CLI에서 모두 unsupported 상태입니다. 체크인된 fixture를 먼저 포팅하고 변경한 다음 새로운 검증 증거를 만들기 전에는 Antigravity 경로로 복사하면 안 됩니다.\n\n## 실제 검증 범위\n\n일회성 staged validator가 바이트가 같은 4개 레이아웃을 만들고 실제 hook/MCP 프로세스를 실행했습니다. four staged layouts에 대한 rule parity remains unverified입니다. CLI/IDE live loading은 unavailable이고, hosted execution에는 fresh receipt가 없으며, real SQLite도 unavailable이었습니다.\n\n## 로컬 재현\n\n\`\`\`sh\nnode scripts/validate-root-toolchain.mjs\nnode scripts/generate-antigravity-docs.mjs --check\nnode scripts/generate-antigravity-score.mjs --check\nnode scripts/validate-antigravity-distribution.mjs\n\`\`\`\n\n신뢰하지 않는 변경을 검토할 때는 격리된 복사본에서 실행하십시오. staged validator는 임시 위치를 사용하고 정리 결과를 보고하지만 live install 명령은 아닙니다.\n\n## 사용성 결론\n\n현재는 로컬 평가와 staged process verification 용도로 사용할 수 있습니다. CLI, IDE, hosted, SQLite의 fresh evidence가 생기기 전까지 live installation이나 production deployment가 입증되었다고 보면 안 됩니다.\n`;

const changelog = `# Changelog\n\nAll notable changes are documented here.\n\n## [Unreleased]\n\n### Changed\n\n- Replaced the previous aspirational user documentation with the verified inventory: 15 active skills, 19 unsupported experimental skills, 2 official hooks, and 3 local MCP servers.\n- Added deterministic English and Korean experimental-status guides generated from checked-in fixtures.\n- Restored the approved exact 100-point capability rubric. Real SQLite, hosted matrix execution, CLI live install/list, and IDE live inspection remain unavailable and earn zero; unrelated local checks cannot substitute for them.\n- Documented Node.js >=20.17 and the limits of staged, CLI, IDE, hosted, and real SQLite verification.\n\n## [0.1.0] - 2026-07-05\n\n### Added\n\n- Initial repository publication.\n`;

const normalizedKorean = korean.replace("\n\n+[", "\n\n[");

const outputs = new Map([
	["README.md", rootReadme], ["src/README.md", english], ["src/README.ko.md", normalizedKorean], ["CHANGELOG.md", changelog],
	["docs/experimental-skills.md", experimentalGuide(false)], ["docs/experimental-skills.ko.md", experimentalGuide(true)],
]);

const prohibited = [/all models supported/i, /model routing/i, /remote MCP/i, /telemetry/i, /auto[- ]?update/i,
	/zero[- ]configuration/i, /100% reliable/i, /eliminates? hallucinations/i, /query (?:Postgres|MySQL)/i, /near[- ]?0%/i];
for (const [path, content] of outputs) for (const pattern of prohibited) if (pattern.test(content)) fail(`prohibited claim in ${path}: ${pattern}`);

const check = process.argv.includes("--check");
for (const [path, content] of outputs) {
	const absolute = join(root, path);
	if (check) {
		if (!existsSync(absolute) || readFileSync(absolute, "utf8") !== content) fail(`generated file drift: ${path}`);
	} else {
		mkdirSync(dirname(absolute), { recursive: true });
		writeFileSync(absolute, content);
	}
}
process.stdout.write(`${JSON.stringify({ status: "passed", files: [...outputs.keys()] })}\n`);
