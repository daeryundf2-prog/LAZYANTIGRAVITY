import { type TrustedEvidenceManifest } from "./evidence-manifest.js";
export type CaptureCommandEvidenceArgs = {
    readonly output?: string;
    readonly command: readonly string[];
};
export type CaptureCommandEvidenceResult = {
    readonly evidence: string;
    readonly artifactPath: string;
    readonly manifestPath: string;
    readonly exitCode: number;
    readonly manifest: TrustedEvidenceManifest;
};
export declare function captureCommandEvidence(repoRoot: string, args: CaptureCommandEvidenceArgs): Promise<CaptureCommandEvidenceResult>;
