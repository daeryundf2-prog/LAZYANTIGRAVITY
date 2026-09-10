import { appendFileSync, chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { hardenWindowsAcl } from "./security.js";

const NONCE_LEDGER_LIMIT = 4096;

export class NonceLedger {
	private consumed = new Set<string>();
	private ledgerPath: string;

	constructor(pidPath: string) {
		this.ledgerPath = `${pidPath}.nonces`;
		this.load();
	}

	private load(): void {
		if (!existsSync(this.ledgerPath)) return;
		try {
			for (const line of readFileSync(this.ledgerPath, "utf8").split(/\r?\n/)) {
				const id = line.trim();
				if (id) this.consumed.add(id);
			}
		} catch {
			/* fail closed at request time if the ledger cannot be read */
		}
	}

	public has(requestId: string): boolean {
		return this.consumed.has(requestId);
	}

	public record(requestId: string): void {
		this.consumed.add(requestId);
		try {
			appendFileSync(this.ledgerPath, `${requestId}\n`, { encoding: "utf8", mode: 0o600 });
			if (process.platform === "win32") {
				hardenWindowsAcl(this.ledgerPath);
			} else {
				try {
					chmodSync(this.ledgerPath, 0o600);
				} catch {
					// fallback to creation mode
				}
			}
			this.prune();
		} catch {
			this.consumed.delete(requestId);
			throw new Error("Unable to persist mutation nonce");
		}
	}

	private prune(): void {
		if (this.consumed.size <= NONCE_LEDGER_LIMIT) return;
		const kept = [...this.consumed].slice(-NONCE_LEDGER_LIMIT / 2);
		this.consumed = new Set(kept);
		writeFileSync(this.ledgerPath, kept.map((id) => `${id}\n`).join(""), { encoding: "utf8", mode: 0o600 });
		if (process.platform === "win32") {
			hardenWindowsAcl(this.ledgerPath);
		} else {
			try {
				chmodSync(this.ledgerPath, 0o600);
			} catch {
				// fallback to creation mode
			}
		}
	}
}
