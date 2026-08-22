const CAPABILITIES = ["structuredOutput", "toolCalling", "parallelToolCalling", "vision"];

export function normalizeCapabilityProbe(response) {
	if (!response || typeof response !== "object" || Array.isArray(response)) throw new TypeError("Capability probe response must be an object");
	const value = response;
	return Object.fromEntries(CAPABILITIES.map((key) => [key, value[key] === true]));
}

export function capabilityFallback(probe) {
	const capabilities = normalizeCapabilityProbe(probe);
	return {
		...capabilities,
		completionRequiresHostEvidence: true,
		mode: capabilities.structuredOutput && capabilities.toolCalling ? "structured" : "text-with-host-verification",
	};
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).pathname === new URL(import.meta.url).pathname) {
	let raw = "";
	for await (const chunk of process.stdin) raw += chunk;
	try { process.stdout.write(`${JSON.stringify(capabilityFallback(JSON.parse(raw)))}\n`); }
	catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
