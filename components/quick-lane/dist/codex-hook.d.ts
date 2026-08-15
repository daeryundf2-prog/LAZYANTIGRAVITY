export type QuickLaneHookInput = {
    readonly hook_event_name: "UserPromptSubmit";
    readonly prompt: string;
    readonly transcript_path?: string | null;
};
export declare function runQuickLaneHook(input: unknown): string;
