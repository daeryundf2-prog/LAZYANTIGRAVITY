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
    constructor(config: DaemonConfig);
    private loadNonceLedger;
    private persistNonce;
    start(): Promise<void>;
    stop(): Promise<void>;
    private cleanup;
    private handleConnection;
    private isExistingDaemonAlive;
    private handleCommand;
}
