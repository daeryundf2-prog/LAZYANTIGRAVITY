export declare function countFileSha256Pair(repoRoot: string, file: string): {
    exists: boolean;
    lines: number;
    sha256: string | null;
};
export declare function fileLineCount(repoRoot: string, file: string): number | null;
