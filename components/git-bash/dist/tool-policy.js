const BLOCKED_COMMANDS = [
    /\brm\s+-rf\s+\/$/i,
    /\bgit\s+reset\s+--hard\b/i,
    /\bgit\s+clean\s+-[a-z]*f/i,
    /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sh|bash|zsh)\b/i,
    /\bsudo\b/i,
];
export function validateToolInvocation(toolName, toolInput) {
    if (!toolName.trim())
        return { allowed: false, reason: "Tool name is required." };
    if (toolName !== "Bash")
        return { allowed: true };
    if (!toolInput || typeof toolInput !== "object" || Array.isArray(toolInput))
        return { allowed: false, reason: "Bash tool input must be an object." };
    const command = toolInput["command"];
    if (typeof command !== "string" || command.trim() === "")
        return { allowed: false, reason: "Bash command is required." };
    if (command.length > 100_000 || command.includes("\u0000"))
        return { allowed: false, reason: "Bash command exceeds safety limits." };
    const blocked = BLOCKED_COMMANDS.find((pattern) => pattern.test(command));
    return blocked === undefined ? { allowed: true } : { allowed: false, reason: "Destructive or remote shell execution requires explicit approval." };
}
