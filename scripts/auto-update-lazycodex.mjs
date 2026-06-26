#!/usr/bin/env node
import { execSync } from "node:child_process";
import { access, cp, mkdir, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(__dirname, "..");
const scratchDir = "C:\\Users\\HP\\.gemini\\antigravity\\scratch";
const tempCloneDir = join(scratchDir, "lazycodex-temp-sync");
const lastCommitFile = join(pluginRoot, ".last_sync_commit");

const EXCLUDED_SKILLS = new Set([
	"comment-checker",
	"lsp",
	"rules",
	"ulw-loop",
	"ulw-plan"
]);

async function exists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function runCommand(command, cwd) {
	console.log(`Running: ${command} (in ${cwd || process.cwd()})`);
	return execSync(command, { cwd, encoding: "utf8" });
}

async function main() {
	try {
		console.log("Checking for upstream lazycodex updates...");
		
		// 1. Fetch remote commit hash
		const lsRemoteOutput = await runCommand(
			"git ls-remote https://github.com/code-yeongyu/lazycodex.git refs/heads/main"
		);
		const match = /^([0-9a-fA-F]+)\s+refs\/heads\/main/.exec(lsRemoteOutput.trim());
		if (!match) {
			throw new Error(`Failed to parse ls-remote output: ${lsRemoteOutput}`);
		}
		const remoteHash = match[1];
		console.log(`Upstream latest commit hash: ${remoteHash}`);

		// 2. Read last sync commit hash
		let lastHash = "";
		if (await exists(lastCommitFile)) {
			lastHash = (await readFile(lastCommitFile, "utf8")).trim();
			console.log(`Last synchronized commit hash: ${lastHash}`);
		} else {
			console.log("No last sync commit file found. First-time sync will be performed.");
		}

		const isForce = process.argv.includes("--force");
		if (remoteHash === lastHash && !isForce) {
			console.log("No new updates found. Up to date!");
			return;
		}

		console.log("New updates detected! Syncing changes...");

		// Pull remote changes to avoid push rejections
		await runCommand("git pull --rebase --autostash origin main", pluginRoot);

		// 3. Clone repository
		if (await exists(tempCloneDir)) {
			console.log(`Cleaning old temp clone directory: ${tempCloneDir}`);
			await rm(tempCloneDir, { recursive: true, force: true });
		}
		await runCommand(
			`git clone --depth=1 --recurse-submodules https://github.com/code-yeongyu/lazycodex.git "${tempCloneDir}"`
		);

		// Sync latest shared-skills to the config/shared-skills directory
		const sharedSkillsSource = join(tempCloneDir, "src", "packages", "shared-skills");
		const sharedSkillsDest = join(pluginRoot, "..", "..", "shared-skills");
		if (await exists(sharedSkillsSource)) {
			console.log("Syncing latest shared-skills to config/shared-skills...");
			if (await exists(sharedSkillsDest)) {
				await rm(sharedSkillsDest, { recursive: true, force: true });
			}
			await cp(sharedSkillsSource, sharedSkillsDest, { recursive: true });
		}

		// 4. Copy skills to skill-aliases/
		const skillsSourceDir = join(tempCloneDir, "plugins", "omo", "skills");
		const skillAliasesDir = join(pluginRoot, "skill-aliases");

		if (await exists(skillsSourceDir)) {
			const entries = await readdir(skillsSourceDir, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				if (EXCLUDED_SKILLS.has(entry.name)) {
					console.log(`Skipping component skill: ${entry.name}`);
					continue;
				}
				
				const sourceSkill = join(skillsSourceDir, entry.name);
				const destAlias = join(skillAliasesDir, entry.name);
				
				console.log(`Copying skill: ${entry.name} -> skill-aliases/${entry.name}`);
				await cp(sourceSkill, destAlias, { recursive: true });
			}
		}

		// 5. Run build
		console.log("Rebuilding plugins and compiling skills for Antigravity...");
		await runCommand("npm run build", pluginRoot);

		// 6. Check if there are changes to commit
		const gitStatus = await runCommand("git status --porcelain", pluginRoot);
		if (gitStatus.trim().length === 0) {
			console.log("Build completed but no files were modified. Saving commit hash.");
			await writeFile(lastCommitFile, remoteHash, "utf8");
			return;
		}

		// 7. Commit & Push
		console.log("Committing changes...");
		await runCommand("git add .", pluginRoot);
		
		// Configure identity locally just in case
		await runCommand('git config user.email "yeongyu@users.noreply.github.com"', pluginRoot);
		await runCommand('git config user.name "Yeongyu Kim"', pluginRoot);
		
		await runCommand(
			`git commit -m "feat(skills): automatically sync upstream lazycodex commits up to ${remoteHash.slice(0, 7)}"`,
			pluginRoot
		);
		
		console.log("Pushing changes to remote repository...");
		await runCommand("git push origin main", pluginRoot);

		// 8. Update commit hash file
		await writeFile(lastCommitFile, remoteHash, "utf8");
		console.log("Auto-update sync and deploy completed successfully!");

	} catch (error) {
		console.error("Auto-update failed with error:", error);
		process.exit(1);
	} finally {
		// Clean up
		if (await exists(tempCloneDir)) {
			try {
				await rm(tempCloneDir, { recursive: true, force: true });
			} catch (cleanupError) {
				console.error("Failed to clean up temp clone directory:", cleanupError);
			}
		}
	}
}

main();
