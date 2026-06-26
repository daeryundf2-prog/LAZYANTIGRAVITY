import { jsonRpcId, runJsonRpcStdioServer, successResponse } from "@oh-my-opencode/mcp-stdio-core";
import { isPlainRecord } from "@oh-my-opencode/mcp-stdio-core/record";
import { handleLspMcpRequest } from "@oh-my-opencode/lsp-core/mcp";
import { callToolViaDaemon, currentRequestContext, } from "./daemon-client.js";
import { daemonPaths } from "./paths.js";
export async function runMcpStdioProxy(options = {}) {
    const input = options.input ?? process.stdin;
    const output = options.output ?? process.stdout;
    const paths = options.paths ?? daemonPaths();
    const context = options.context ?? currentRequestContext();
    const callOptions = { paths, context, ...(options.ensure ? { ensure: options.ensure } : {}) };
    await runJsonRpcStdioServer({
        input,
        output,
        handler: handleProxyRequest,
        handlerOptions: callOptions,
        onHandlerError: (error) => {
            process.stderr.write(`[lsp-daemon] proxy error: ${error instanceof Error ? error.message : String(error)}\n`);
        },
    });
}
async function handleProxyRequest(parsed, callOptions) {
    const toolCall = asToolCall(parsed);
    if (!toolCall)
        return handleLspMcpRequest(parsed);
    const result = await callToolViaDaemon(toolCall.name, toolCall.args, callOptions);
    return successResponse(toolCall.id, { content: result.content, isError: result.isError ?? false, details: result.details });
}
function asToolCall(parsed) {
    if (!isPlainRecord(parsed) || parsed["method"] !== "tools/call")
        return null;
    const params = parsed["params"];
    if (!isPlainRecord(params) || typeof params["name"] !== "string")
        return null;
    const args = params["arguments"];
    return { id: jsonRpcId(parsed["id"]), name: params["name"], args: isPlainRecord(args) ? args : {} };
}
