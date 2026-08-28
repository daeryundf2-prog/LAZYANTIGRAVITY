export interface DaemonConfig {
    socketPath: string;
    pidPath: string;
    tokenPath: string;
}
export declare function getDaemonPaths(cwd?: string): DaemonConfig;
export declare class DaemonServer {
    private server;
    private blackboard;
    private config;
    private startTime;
    private token;
    private consumedRequestIds;
    private nonceLedgerPath;
    private stopRequested;
    constructor(config: DaemonConfig);
    private loadNonceLedger;
    private persistNonce;
    start(): Promise<void>;
    stop(): Promise<void>;
    isStopRequested(): boolean;
    private cleanup;
    private handleConnection;
    private isExistingDaemonAlive;
    private handleCommand;
}
