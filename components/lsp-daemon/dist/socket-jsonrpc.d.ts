export declare function encodeJsonLine(message: unknown): string;
export interface LineDecoder {
    push(chunk: Buffer | string): void;
}
export declare function createLineDecoder(onMessage: (value: unknown) => void, onParseError?: (raw: string, error: unknown) => void): LineDecoder;
