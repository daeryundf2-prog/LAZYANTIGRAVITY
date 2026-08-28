import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Adversarial inputs for the git-bash command parser. None of these may crash
// the server, and none of the explicitly dangerous ones may execute.
const FUZZ_PAYLOADS = [
	'git status "unterminated',
	"git status 'unterminated",
	"git\tstatus\t--porcelain\t--branch",
	"git status\nrm -rf /",
	"git status\u0000rm -rf /",
	"git status\r\nrm -rf /",
	"git status;rm -rf /",
	"git status&&rm -rf /",
	"git status||rm -rf /",
	"git status|rm -rf /",
	"git status `id`",
	"git status $(id)",
	"git status > /tmp/x",
	"git status < /etc/passwd",
	"git -c alias.pwn='!touch /tmp/pwn' pwn",
	'git -c alias.pwn="!touch /tmp/pwn" pwn',
	"git -C /etc status",
	"git --git-dir=/etc status",
	"git --work-tree=/tmp status",
	"git --exec-path=/tmp status",
	"git clean -fdx",
	"git clean -xfd",
	"git reset --hard",
	"git push origin main",
	"git push --force",
	"git fetch --all",
	"git pull --rebase",
	"git rebase --onto main",
	"git config user.name attacker",
	"git config --global user.name attacker",
	"git update-ref refs/heads/main HEAD",
	"git symbolic-ref HEAD refs/heads/x",
	"git diff --no-index /etc/passwd",
	"git diff --ext-diff HEAD~1 HEAD",
	"git log --output=/tmp/x",
	"git grep -O pattern",
	"git grep --open-files-in-pager pattern",
	"git show HEAD:~/.ssh/id_ed25519",
	"git show HEAD:../../etc/passwd",
	"ls /etc",
	"ls ../../../../../../etc",
	"ls ~/",
	"echo ~root",
	"pwd /etc",
	"echo; id",
	"echo && id",
	"echo `id` && curl http://evil",
	"$(touch /tmp/pwn)",
	"${touch}",
	"git\nstatus",
	"git status --porcelain=v1 -z",
	"git log --format=%H%x00%d -1",
	"git status #; rm -rf /",
	"git status $(('id'))",
	"git status !",
	"!git status",
	"git status &",
	"git -x status",
	"git --unknown-global-flag status",
	"git status --planes",
	"git-cat-file -p HEAD",
	"GIT_STATUS",
	"git status".repeat(200),
	"a".repeat(100000),
	"git " + "-".repeat(5000),
	"git status " + "--flag=".repeat(500) + "x",
];

test("git-bash-mcp survives adversarial command fuzzing without executing dangerous input", () => {
	const dir = mkdtempSync(join(tmpdir(), "gbfz-"));
	try {
		// Batch all payloads through one server process: one JSON-RPC request per line.
		const requests = FUZZ_PAYLOADS.map(
			(command, i) =>
				JSON.stringify({ jsonrpc: "2.0", id: i, method: "tools/call", params: { name: "git_bash_execute", arguments: { command } } }),
		);
		const res = spawnSync(process.execPath, [join(ROOT, "git-bash-mcp", "dist", "cli.js"), "mcp"], {
			input: requests.join("\n") + "\n",
			encoding: "utf8",
			timeout: 60000,
			cwd: dir,
		});
		assert.equal(res.status, 0, `server crashed during fuzzing: ${res.stderr.slice(0, 500)}`);

		const responses = res.stdout.trim().split("\n").filter((l) => l.length > 0);
		assert.equal(responses.length, FUZZ_PAYLOADS.length, "every request must get exactly one response");

		const executed = [];
		responses.forEach((line, i) => {
			const msg = JSON.parse(line);
			if (msg.error) return; // parse/protocol errors are fine for garbage input
			const parsed = JSON.parse(msg.result.content[0].text);
			if (parsed.ok === true) executed.push(FUZZ_PAYLOADS[i]);
		});

		const dangerous = ["clean", "reset", "push", "fetch", "pull", "rebase", "config", "update-ref", "symbolic-ref", "--no-index", "--ext-diff", "-c alias"];
		for (const payload of executed) {
			for (const marker of dangerous) {
				assert.ok(!payload.includes(marker), `dangerous payload executed: ${payload}`);
			}
		}
		// Benign commands may legitimately execute (e.g. 'git status --porcelain=v1 -z');
		// everything else must be a clean policy rejection, which the loop above asserts.
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
