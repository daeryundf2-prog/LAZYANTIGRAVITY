export function toMarkdown(report) {
	const lines = ["# LazyAntigravity Provenance", ""];
	for (const section of ["generated", "vendored_or_symlinked", "source_roots", "component_packages", "build_scripts"]) {
		lines.push(`## ${section}`, "");
		for (const entry of report[section]) {
			lines.push(`- ${entry.path}: ${entry.owner} (${entry.build_step}, ${entry.status})`);
		}
		lines.push("");
	}
	return lines.join("\n");
}
