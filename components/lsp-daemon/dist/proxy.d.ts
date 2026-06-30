import type { Readable, Writable } from "node:stream";
import { type CallToolOptions, type DaemonToolContext } from "./daemon-client.js";
import { type DaemonPaths } from "./paths.js";
export interface ProxyOptions {
    input?: Readable;
    output?: Writable;
    paths?: DaemonPaths;
    context?: DaemonToolContext;
    ensure?: CallToolOptions["ensure"];
}
export declare function runMcpStdioProxy(options?: ProxyOptions): Promise<void>;
