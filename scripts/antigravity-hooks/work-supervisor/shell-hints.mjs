const REDIRECT_RE = />>?(\s+([^\s;|&]+))?/g;
const INLINE_SCRIPT_RE = /(?:python3?|node)\s+(-c|-e)\s+["']([^"']+)["']/gi;
const PYTHON_WRITE_RE = /(?:write_text|write_bytes|mkdir|unlink|chmod|symlink_to|rename|replace)\s*\(/g;
const PATH_WRITE_RE = /Path\s*\(\s*["']([^"']+)["']\s*\)\s*\.\s*(?:write_text|write_bytes|unlink|mkdir|chmod)\s*\(/g;
const FS_WRITE_RE = /fs\.(?:writeFileSync|appendFileSync|rmSync|unlinkSync)\s*\(\s*["']([^"']+)["']/g;
const SED_INPLACE_RE = /sed\s+-i\b\s+(?:[^ ]*\s+)?([^\s;|&]+(?:\.[A-Za-z0-9]+)?)\s*$/g;
const TEE_RE = /\btee\s+([^\s;|&]+)/g;
const CP_RE = /\bcp\s+[^ ]+\s+([^\s;|&]+)/g;
const MV_RE = /\bmv\s+[^ ]+\s+([^\s;|&]+)/g;
const RM_RE = /\brm\s+[^;|&]*\s+([^\s;|&]+)/g;
const POWERSHELL_WRITE_RE = /(?:Set-Content|Add-Content|Out-File)\s+.*?-Path\s+([^\s;|&]+)/gi;
const ENV_SPLIT_RE = /env\s+-S\s+["']([^"']+)["']/i;

export function shellCandidatePaths(command) {
	if (!command || typeof command !== "string") return [];
	const candidates = new Set();

	for (const match of command.matchAll(REDIRECT_RE)) {
		const target = match[2];
		if (target && !target.startsWith("&")) {
			candidates.add(target.replace(/['"]/g, ""));
		}
	}

	for (const match of command.matchAll(PATH_WRITE_RE)) {
		candidates.add(match[1]);
	}

	for (const match of command.matchAll(FS_WRITE_RE)) {
		candidates.add(match[1]);
	}

	for (const match of command.matchAll(SED_INPLACE_RE)) {
		candidates.add(match[1]);
	}

	for (const match of command.matchAll(TEE_RE)) {
		const target = match[1];
		if (!target.startsWith("-")) {
			candidates.add(target);
		}
	}

	for (const match of command.matchAll(CP_RE)) {
		candidates.add(match[1]);
	}

	for (const match of command.matchAll(MV_RE)) {
		candidates.add(match[1]);
	}

	for (const match of command.matchAll(RM_RE)) {
		candidates.add(match[1]);
	}

	for (const match of command.matchAll(POWERSHELL_WRITE_RE)) {
		candidates.add(match[1].replace(/['"]/g, ""));
	}

	const envMatch = command.match(ENV_SPLIT_RE);
	if (envMatch) {
		const nestedCmd = envMatch[1];
		const nestedPaths = shellCandidatePaths(nestedCmd);
		nestedPaths.forEach((p) => candidates.add(p));
	}

	const inlineMatches = [...command.matchAll(INLINE_SCRIPT_RE)];
	for (const match of inlineMatches) {
		const script = match[2];
		const scriptPaths = extractInlineScriptPaths(script, match[1]);
		scriptPaths.forEach((p) => candidates.add(p));
	}

	return [...candidates].filter((p) => p && !p.startsWith("(") && p.length > 1);
}

function extractInlineScriptPaths(script, flag) {
	const paths = new Set();
	if (flag === "-c" || flag === "-e") {
		if (script.includes("write_text") || script.includes("write_bytes") || script.includes("unlink") || script.includes("mkdir")) {
			for (const match of script.matchAll(/["']([^"']+)["']/g)) {
				if (match[1].includes("/") || match[1].includes("\\") || match[1].includes(".")) {
					paths.add(match[1]);
				}
			}
		}
	}
	return [...paths];
}
