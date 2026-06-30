import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { disposeDefaultLspManager, getLspManager } from "@oh-my-opencode/lsp-core/lsp/manager";
import { unlinkQuietly } from "./lock.js";
import { handleDaemonMessage } from "./request-routing.js";
import { createLineDecoder, encodeJsonLine } from "./socket-jsonrpc.js";
const DEFAULT_IDLE_SHUTDOWN_MS = 30 * 60_000;
const DEFAULT_IDLE_CHECK_INTERVAL_MS = 60_000;
export async function startDaemonServer(paths, options = {}) {
    const idleShutdownMs = options.idleShutdownMs ?? DEFAULT_IDLE_SHUTDOWN_MS;
    const idleCheckIntervalMs = options.idleCheckIntervalMs ?? DEFAULT_IDLE_CHECK_INTERVAL_MS;
    mkdirSync(paths.dir, { recursive: true });
    unlinkQuietly(paths.socket);
    const connections = new Set();
    let lastActiveAt = Date.now();
    const touch = () => {
        lastActiveAt = Date.now();
    };
    const server = createServer((socket) => {
        connections.add(socket);
        touch();
        const decoder = createLineDecoder((message) => {
            touch();
            void respond(socket, message);
        });
        socket.on("data", (chunk) => decoder.push(chunk));
        socket.on("error", () => socket.destroy());
        socket.on("close", () => {
            connections.delete(socket);
            touch();
        });
    });
    server.on("error", (error) => logServerError(error));
    const endpointPath = join(paths.dir, "daemon.endpoint");
    await listen(server, paths.socket);
    writeFileSync(paths.pid, `${process.pid}\n`);
    writeFileSync(endpointPath, paths.socket);
    let closed = false;
    const close = async () => {
        if (closed)
            return;
        closed = true;
        clearInterval(idleTimer);
        for (const socket of connections)
            socket.destroy();
        connections.clear();
        await closeServer(server);
        unlinkQuietly(paths.socket);
        unlinkQuietly(paths.pid);
        unlinkQuietly(endpointPath);
        await disposeDefaultLspManager();
    };
    const idleTimer = setInterval(() => {
        if (connections.size > 0)
            return;
        if (getLspManager().clientCount() > 0) {
            touch();
            return;
        }
        if (Date.now() - lastActiveAt < idleShutdownMs)
            return;
        if (options.onIdleShutdown) {
            options.onIdleShutdown();
            return;
        }
        void close().then(() => process.exit(0));
    }, idleCheckIntervalMs);
    idleTimer.unref();
    installSignalHandlers(close);
    return { server, close };
}
async function respond(socket, message) {
    try {
        const response = await handleDaemonMessage(message);
        if (response && socket.writable)
            socket.write(encodeJsonLine(response));
    }
    catch (error) {
        logServerError(error);
    }
}
function listen(server, socketPath) {
    return new Promise((resolve, reject) => {
        const onError = (error) => reject(error);
        server.once("error", onError);
        server.listen(socketPath, () => {
            server.removeListener("error", onError);
            resolve();
        });
    });
}
function closeServer(server) {
    return new Promise((resolve) => server.close(() => resolve()));
}
function installSignalHandlers(close) {
    const handler = () => {
        void close().then(() => process.exit(0));
    };
    process.once("SIGTERM", handler);
    process.once("SIGINT", handler);
}
function logServerError(error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`[lsp-daemon] ${message}\n`);
}
