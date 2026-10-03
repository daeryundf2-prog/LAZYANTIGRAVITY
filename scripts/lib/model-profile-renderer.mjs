// Marker text lives in model-catalog.json (antigravity.profiles.<name>.guide) so that
// switching profiles is a data change, not a code change.

export const MARKER_FILES = [
	{ path: "shared-skills/skills/ulw/SKILL.md", markers: ["ulw-guide"] },
	{ path: "components/ulw-loop/skills/ulw-loop/SKILL.md", markers: ["ulw-loop-guide", "ulw-loop-fallback"] },
	{ path: "README.md", markers: ["readme-table"] },
	{ path: "components/rules/bundled-rules/hephaestus.md", markers: ["hephaestus-routing"] },
];

export function detectEol(content) {
	return content.includes("\r\n") ? "\r\n" : "\n";
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function getMarkerContent(content, markerId) {
	const id = escapeRegex(markerId);
	const match = content.match(
		new RegExp(`<!-- MODEL-PROFILE:BEGIN ${id} -->\\r?\\n([\\s\\S]*?)\\r?\\n<!-- MODEL-PROFILE:END ${id} -->`),
	);
	return match ? match[1] : null;
}

export function replaceMarkerBlock(content, markerId, newInnerContent) {
	const eol = detectEol(content);
	const startTag = `<!-- MODEL-PROFILE:BEGIN ${markerId} -->`;
	const endTag = `<!-- MODEL-PROFILE:END ${markerId} -->`;
	const startIndex = content.indexOf(startTag);
	const endIndex = content.indexOf(endTag);
	if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
		throw new Error(`Marker block '${markerId}' not found in content`);
	}
	const inner = newInnerContent.replace(/\r?\n/g, eol);
	return `${content.slice(0, startIndex + startTag.length)}${eol}${inner}${eol}${content.slice(endIndex)}`;
}

function fillPlaceholders(text, profile) {
	const model = profile.modelName ?? "";
	const modelBase = model.replace(/\s*\([^)]*\)\s*$/, "").trim();
	const verifyLane = profile.verifyLaneText?.[profile.lanes?.verifyLane ?? "pro"] ?? "";
	return text
		.replaceAll("{verifyLane}", verifyLane)
		.replaceAll("{modelBase}", modelBase)
		.replaceAll("{model}", model);
}

function renderFallback(profile) {
	return Object.entries(profile.fallbackTable)
		.map(([limited, next]) => `- **When ${limited} is limited**: ${next}`)
		.join("\n");
}

export function renderMarkerContent(markerId, profile) {
	if (markerId === "ulw-loop-fallback") return fillPlaceholders(renderFallback(profile), profile);
	const lines = profile.guide?.[markerId];
	if (!Array.isArray(lines)) throw new Error(`Profile has no guide lines for marker '${markerId}'`);
	return fillPlaceholders(lines.join("\n"), profile);
}
