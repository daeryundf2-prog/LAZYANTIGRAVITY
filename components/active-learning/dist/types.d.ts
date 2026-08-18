export interface TelemetryFailureEvent {
    id: string;
    timestamp: number;
    eventType: "tool_error" | "test_failure" | "lint_error" | "timeout";
    toolName?: string;
    targetPath?: string;
    errorMessage: string;
}
export interface LearnedGotcha {
    id: string;
    pattern: string;
    suggestedRule: string;
    confidence: number;
    occurrences: number;
}
export interface ActiveLearningReport {
    analyzedEvents: number;
    identifiedPatterns: number;
    promotedGotchas: LearnedGotcha[];
}
