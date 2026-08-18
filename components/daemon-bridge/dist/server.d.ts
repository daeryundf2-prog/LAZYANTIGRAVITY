export interface DaemonConfig {
    socketPath: string;
    pidPath: string;
}
export declare function getDaemonPaths(cwd?: string): DaemonConfig;
export declare class DaemonServer {
    private server;
    private blackboard;
    private config;
    private startTime;
    constructor(config: DaemonConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
    private cleanup;
    private handleConnection;
    private handleCommand;
}
