export function formatAdditionalContextOutput(eventName, additionalContext) {
    const normalizedContext = normalizeAdditionalContext(additionalContext);
    if (normalizedContext.length === 0)
        return "";
    return `${JSON.stringify({
        hookSpecificOutput: {
            hookEventName: eventName,
            additionalContext: normalizedContext,
        },
    })}\n`;
}
function normalizeAdditionalContext(additionalContext) {
    return additionalContext.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}
