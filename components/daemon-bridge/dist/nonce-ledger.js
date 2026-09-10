import { appendFileSync, chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { hardenWindowsAcl } from "./security.js";
const NONCE_LEDGER_LIMIT = 4096;
export class NonceLedger {
    consumed = new Set();
    ledgerPath;
    constructor(pidPath) {
        this.ledgerPath = `${pidPath}.nonces`;
        this.load();
    }
    load() {
        if (!existsSync(this.ledgerPath))
            return;
        try {
            for (const line of readFileSync(this.ledgerPath, "utf8").split(/\r?\n/)) {
                const id = line.trim();
                if (id)
                    this.consumed.add(id);
            }
        }
        catch {
            /* fail closed at request time if the ledger cannot be read */
        }
    }
    has(requestId) {
        return this.consumed.has(requestId);
    }
    record(requestId) {
        this.consumed.add(requestId);
        try {
            appendFileSync(this.ledgerPath, `${requestId}\n`, { encoding: "utf8", mode: 0o600 });
            if (process.platform === "win32") {
                hardenWindowsAcl(this.ledgerPath);
            }
            else {
                try {
                    chmodSync(this.ledgerPath, 0o600);
                }
                catch {
                    // fallback to creation mode
                }
            }
            this.prune();
        }
        catch {
            this.consumed.delete(requestId);
            throw new Error("Unable to persist mutation nonce");
        }
    }
    prune() {
        if (this.consumed.size <= NONCE_LEDGER_LIMIT)
            return;
        const kept = [...this.consumed].slice(-NONCE_LEDGER_LIMIT / 2);
        this.consumed = new Set(kept);
        writeFileSync(this.ledgerPath, kept.map((id) => `${id}\n`).join(""), { encoding: "utf8", mode: 0o600 });
        if (process.platform === "win32") {
            hardenWindowsAcl(this.ledgerPath);
        }
        else {
            try {
                chmodSync(this.ledgerPath, 0o600);
            }
            catch {
                // fallback to creation mode
            }
        }
    }
}
