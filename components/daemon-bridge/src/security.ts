import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";

export function ensurePrivateDirectory(path: string): void {
	mkdirSync(path, { recursive: true, mode: 0o700 });
	try {
		chmodSync(path, 0o700);
	} catch {
		// The directory may be on a filesystem without chmod support.
	}
}

export function ensureToken(path: string): void {
	if (!existsSync(path)) {
		const fd = openSync(path, "wx", 0o600);
		try {
			writeFileSync(fd, randomBytes(32).toString("hex"), "utf8");
		} finally {
			closeSync(fd);
		}
	}
	chmodSync(path, 0o600);
}

export function tokenMatches(expected: string, received: unknown): boolean {
	if (typeof received !== "string") return false;
	const expectedBytes = Buffer.from(expected);
	const receivedBytes = Buffer.from(received);
	return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}
