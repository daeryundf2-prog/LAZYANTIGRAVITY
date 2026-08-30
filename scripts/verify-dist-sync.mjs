#!/usr/bin/env node
import { spawnSync } from "node:child_process";

console.log("[verify-dist-sync] Verifying source-to-dist compilation reproducibility...");

const shell = process.platform === "win32";

const buildRes = spawnSync("npm", ["run", "build"], { stdio: "inherit", shell });
if (buildRes.status !== 0) {
	console.error("[verify-dist-sync] Build failed during reproducibility check.");
	process.exit(1);
}

// 커밋된 모든 빌드 산출물이 소스와 일치하는지 검사한다. 번들 MCP 4종의 dist도
// 대상에 포함한다 — 구버전은 components/*만 봐서 MCP dist가 벗어나도 몰랐다.
const DIST_PATHS = [
	"components/*/dist",
	"plugins/omo/components/*/dist",
	"git-bash-mcp/dist",
	"ast-grep-mcp/dist",
	"lsp-tools-mcp/dist",
	"workspace-mcp/dist",
];

// git status --porcelain 은 autocrlf 환경에서 EOL 유실없는 유령 변경을
// 보고할 수 있다(이 레포 CI의 "Windows EOL drift" 계열). 대신 (1) diff로
// 내용 변화를, (2) ls-files --others로 untracked 신규 파일을 잡는다 —
// 둘 다 staged 변경도 커버한다.
function gitOut(args) {
	const res = spawnSync("git", args, { encoding: "utf8", shell });
	if (res.error !== undefined) throw res.error;
	if (res.status !== 0) {
		console.error(`[verify-dist-sync] git ${args[0]} failed.`);
		process.exit(res.status ?? 1);
	}
	return (res.stdout ?? "").trim();
}

const changed = gitOut(["diff", "--name-only", "HEAD", "--", ...DIST_PATHS]);
const untracked = gitOut(["ls-files", "--others", "--exclude-standard", "--", ...DIST_PATHS]);
const offenders = [changed, untracked].filter((s) => s.length > 0).join("\n");

if (offenders.length > 0) {
	console.error("[verify-dist-sync] Found uncommitted, staged, or out-of-sync dist build artifacts:");
	console.error(offenders);
	console.error("[verify-dist-sync] Please run 'npm run build' and stage all dist artifacts.");
	process.exit(1);
}

console.log("[verify-dist-sync] All dist outputs (15 components + 4 bundled MCP runtimes + omo mirror) match sources 100%.");
process.exit(0);
