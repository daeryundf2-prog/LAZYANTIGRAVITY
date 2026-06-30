export function encodeJsonLine(message) {
    return `${JSON.stringify(message)}\n`;
}
export function createLineDecoder(onMessage, onParseError) {
    let buffer = "";
    return {
        push(chunk) {
            buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
            let index = buffer.indexOf("\n");
            while (index !== -1) {
                const raw = buffer.slice(0, index).trim();
                buffer = buffer.slice(index + 1);
                if (raw.length > 0) {
                    try {
                        onMessage(JSON.parse(raw));
                    }
                    catch (error) {
                        onParseError?.(raw, error);
                    }
                }
                index = buffer.indexOf("\n");
            }
        },
    };
}
