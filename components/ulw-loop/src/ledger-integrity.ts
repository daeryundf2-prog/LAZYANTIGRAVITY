import type { LedgerEvent } from "./control-plane-types.js";
import { computeLedgerHash, GENESIS_HASH } from "./control-plane.js";
import { readRunEvents } from "./reconstruct.js";

export type LedgerVerificationResult = {
	readonly valid: boolean;
	readonly eventCount: number;
	readonly brokenIndex?: number;
	readonly expectedHash?: string;
	readonly actualHash?: string;
};

export async function verifyLedgerIntegrity(repoRoot: string, runId: string): Promise<LedgerVerificationResult> {
	const events = await readRunEvents(repoRoot, runId);
	for (let i = 0; i < events.length; i++) {
		const event: LedgerEvent | undefined = events[i];
		if (event === undefined) continue;
		const previousEvent: LedgerEvent | undefined = events[i - 1];
		const expectedPrevHash = previousEvent === undefined ? GENESIS_HASH : previousEvent.hash;
		if (event.prevHash !== expectedPrevHash) {
			return {
				valid: false,
				eventCount: events.length,
				brokenIndex: i,
				...(expectedPrevHash === undefined ? {} : { expectedHash: expectedPrevHash }),
				...(event.prevHash === undefined ? {} : { actualHash: event.prevHash }),
			};
		}
		const recomputed = computeLedgerHash(event);
		if (event.hash !== recomputed) {
			return {
				valid: false,
				eventCount: events.length,
				brokenIndex: i,
				...(recomputed === undefined ? {} : { expectedHash: recomputed }),
				...(event.hash === undefined ? {} : { actualHash: event.hash }),
			};
		}
	}
	return { valid: true, eventCount: events.length };
}