export const QUICK_LANE_DIRECTIVE = `<quick-lane-mode>
# Quick-Lane Fast-Pass Execution Directive

You are operating in Quick-Lane (Fast-Pass) mode for this prompt.
The user request has been classified as a direct, bounded, or simple operation (e.g., direct question, single-file reading/explanation, small 1-file tweak under 20 LOC, format or lint correction).

## Fast-Pass Operational Rules:
1. **Zero Subagent Overhead**: Do NOT spawn subagents (\`invoke_subagent\`) or start multi-phase interview loops for bounded tasks.
2. **Direct Action**: Execute necessary tool calls directly in sequence (e.g., \`view_file\`, \`replace_file_content\`, \`run_command\`).
3. **Lightweight Verification**: Verify your single-step change immediately with a quick targeted test or syntax check.
4. **Immediate Delivery**: Deliver the clear, concise result directly to the user without redundant planning or multi-agent ceremonials.
</quick-lane-mode>`;
