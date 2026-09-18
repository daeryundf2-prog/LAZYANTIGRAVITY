export const RESPONSE_BYTE_LIMIT = 2 * 1024 * 1024;

export async function readLimitedText(response, limit = RESPONSE_BYTE_LIMIT) {
	if (Number(response.headers?.get("content-length")) > limit) {
		await response.body?.cancel();
		throw new Error("Response exceeds byte limit");
	}
	if (!response.body?.getReader) throw new Error("Streaming response body required");
	const reader = response.body.getReader();
	const chunks = [];
	let size = 0;
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > limit) {
				await reader.cancel();
				throw new Error("Response exceeds byte limit");
			}
			chunks.push(Buffer.from(value));
		}
		return Buffer.concat(chunks, size).toString("utf8");
	} finally {
		reader.releaseLock();
	}
}

export async function readLimitedJson(response) {
	return JSON.parse(await readLimitedText(response));
}
