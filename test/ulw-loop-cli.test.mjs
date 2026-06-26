import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

import { root } from "./aggregate-plugin-fixture.mjs";

test("#given bundled ulw-loop CLI #when top-level help runs #then all dist imports resolve", () => {
	const result = spawnSync(process.execPath, [join(root, "components", "ulw-loop", "dist", "cli.js"), "--help"], {
		cwd: root,
		encoding: "utf8",
	});

	assert.equal(result.status, 0);
	assert.equal(result.stderr, "");
	assert.match(result.stdout, /omo ulw-loop <subcommand>/);
});
