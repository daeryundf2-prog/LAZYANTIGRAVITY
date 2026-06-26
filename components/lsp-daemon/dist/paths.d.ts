export interface DaemonPaths {
    version: string;
    dir: string;
    socket: string;
    lock: string;
    pid: string;
    log: string;
}
export declare function resolveDaemonVersion(requireFn?: (id: string) => unknown): string;
export declare function daemonBaseDir(env?: NodeJS.ProcessEnv): string;
export declare function daemonPaths(env?: NodeJS.ProcessEnv, version?: string): DaemonPaths;
