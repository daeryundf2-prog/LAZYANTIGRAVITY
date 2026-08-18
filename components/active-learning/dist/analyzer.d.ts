import { LearnedGotcha, TelemetryFailureEvent } from "./types.js";
export declare function readFailureEvents(cwd?: string): TelemetryFailureEvent[];
export declare function extractFailurePatterns(events: TelemetryFailureEvent[]): LearnedGotcha[];
