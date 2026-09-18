export interface FactReview {
    reviewer: string;
    reviewedAt: string;
    decision: "approved" | "rejected";
    evidence: {
        file: string;
        sha256: string;
    };
}
export interface FactMetadata {
    source?: string;
    review?: FactReview;
}
export declare function validateFactReview(value: unknown, content: string, factsPath: string): FactReview;
export declare function factMetadata(value: unknown, content: string, factsPath: string, strict?: boolean): FactMetadata;
