export declare function runGit(cmdArgs: string[], cwd?: string, throwOnError?: boolean): string;
export declare function createShadowSnapshot(label: string, cwd?: string): string;
export declare function restoreShadowSnapshot(commitSha: string, cwd?: string): void;
