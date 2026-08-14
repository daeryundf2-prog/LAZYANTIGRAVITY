export function toText(report) {
	const lines = [
		`${report.product.name} doctor: ${report.status}`,
		`root: ${report.root}`,
		"",
		...sectionLines("manifests", report.manifests),
		...sectionLines("hooks", report.hooks),
		...sectionLines("mcp", report.mcp),
		...sectionLines("skills", report.skills),
		...sectionLines("bundles", report.bundles),
		...sectionLines("versions", report.versions),
	];
	if (report.warnings.items.length > 0) {
		lines.push("", "warnings:");
		for (const warning of report.warnings.items) {
			lines.push(`- [${warning.section}] ${warning.code}: ${warning.message}`);
		}
	}
	return lines.join("\n");
}

function sectionLines(name, section) {
	return [`${name}: ${section.status}`];
}
