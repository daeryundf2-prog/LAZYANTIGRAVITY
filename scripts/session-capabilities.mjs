import { capabilityFallback } from "./model-capability-probe.mjs";

export async function initializeSessionCapabilities(probe) {
	try {
		const response = await probe();
		return { ...capabilityFallback(response), probeStatus: "verified" };
	} catch (error) {
		return {
			structuredOutput: false,
			toolCalling: false,
			parallelToolCalling: false,
			vision: false,
			completionRequiresHostEvidence: true,
			mode: "text-with-host-verification",
			probeStatus: "failed",
			probeError: error instanceof Error ? error.message : String(error),
		};
	}
}

export function requireHostEvidence(capabilities) {
	if (!capabilities || capabilities.completionRequiresHostEvidence !== true) {
		throw new Error("Session capability state must require Host evidence.");
	}
	return capabilities;
}
