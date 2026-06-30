import { connect } from "node:net";
import { ensureDaemonRunning } from "./ensure-daemon.js";
import { daemonPaths } from "./paths.js";
import { CONTEXT_KEY } from "./request-routing.js";
import { createLineDecoder, encodeJsonLine } from "./socket-jsonrpc.js";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const REQUEST_ID = 1;
export class DaemonRequestError extends Error {
    constructor(message, requestWritten) {
        super(message);
        this.name = "DaemonRequestError";
        this.requestWritten = requestWritten;
    }
}
export async function callToolViaDaemon(name, args, options = {}) {
    const paths = options.paths ?? daemonPaths();
    const ensure = options.ensure ?? ensureDaemonRunning;
    const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const requestArgs = withContext(args, options.context);
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            await ensure(paths);
            return await sendToolCall(paths.socket, name, requestArgs, timeoutMs);
        }
        catch (error) {
            lastError = error;
            if (error instanceof DaemonRequestError && error.requestWritten)
                break;
        }
    }
    return daemonUnreachableResult(paths, lastError);
}
export function callDiagnosticsViaDaemon(filePath, options = {}) {
    return callToolViaDaemon("diagnostics", { filePath, severity: "error" }, options);
}
const FORWARDED_ENV_KEYS = [
    "LSP_TOOLS_MCP_PROJECT_CONFIG",
    "LSP_TOOLS_MCP_USER_CONFIG",
    "LSP_TOOLS_MCP_INSTALL_DECISIONS",
];
export function currentRequestContext(env = process.env) {
    const forwarded = {};
    for (const key of FORWARDED_ENV_KEYS) {
        const value = env[key];
        if (value !== undefined)
            forwarded[key] = value;
    }
    return { cwd: process.cwd(), env: forwarded };
}
function withContext(args, context) {
    if (!context || (context.cwd === undefined && context.env === undefined))
        return args;
    return { ...args, [CONTEXT_KEY]: context };
}
function daemonUnreachableResult(paths, error) {
    const text = [
        `LSP daemon unreachable: ${errorText(error)}.`,
        "The MCP server is a thin proxy and never runs language servers in-process.",
        `Socket: ${paths.socket}`,
        `Logs: ${paths.log}`,
        "The daemon is auto-started on demand and will be retried on the next request.",
    ].join("\n");
    return { content: [{ type: "text", text }], isError: true };
}
function sendToolCall(socketPath, name, args, timeoutMs) {
    return new Promise((resolve, reject) => {
        const socket = connect(socketPath);
        let settled = false;
        let requestWritten = false;
        const finish = (run) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            socket.destroy();
            run();
        };
        const timer = setTimeout(() => finish(() => reject(new DaemonRequestError("daemon request timed out", requestWritten))), timeoutMs);
        timer.unref();
        const decoder = createLineDecoder((message) => {
            const result = toToolResult(message);
            if (result)
                finish(() => resolve(result));
            else
                finish(() => reject(new DaemonRequestError("invalid daemon response", requestWritten)));
        });
        socket.once("connect", () => {
            requestWritten = true;
            socket.write(encodeJsonLine({ jsonrpc: "2.0", id: REQUEST_ID, method: "tools/call", params: { name, arguments: args } }));
        });
        socket.on("data", (chunk) => decoder.push(chunk));
        socket.once("error", (error) => finish(() => reject(new DaemonRequestError(error.message, requestWritten))));
        socket.once("close", () => finish(() => reject(new DaemonRequestError("daemon connection closed", requestWritten))));
    });
}
function toToolResult(message) {
    if (!isRecord(message) || message["id"] !== REQUEST_ID)
        return null;
    const result = message["result"];
    if (!isRecord(result) || !Array.isArray(result["content"]))
        return null;
    return {
        content: result["content"],
        isError: result["isError"] === true,
        details: result["details"],
    };
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function errorText(error) {
    return error instanceof Error ? error.message : String(error);
}
