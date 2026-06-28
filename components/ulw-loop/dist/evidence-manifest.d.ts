export declare const TRUSTED_EVIDENCE_MANIFEST_KIND = "ulw-loop.evidence-capture.v1";
export declare const TRUSTED_EVIDENCE_MANIFEST_VERSION = 1;
export type TrustedEvidenceManifest = {
    readonly version: 1;
    readonly kind: typeof TRUSTED_EVIDENCE_MANIFEST_KIND;
    readonly command: readonly string[];
    readonly cwd: string;
    readonly exitCode: number;
    readonly exitSignal: string | null;
    readonly startedAt: string;
    readonly endedAt: string;
    readonly durationMs: number;
    readonly artifactPath: string;
    readonly artifactSha256: string;
    readonly nonce: string;
    readonly captureTool: "omo-ulw-loop capture-evidence";
};
export declare function fileSha256Hex(path: string): string;
export declare function parseTrustedEvidenceManifest(raw: string): TrustedEvidenceManifest;
