export declare class NonceLedger {
    private consumed;
    private ledgerPath;
    constructor(pidPath: string);
    private load;
    has(requestId: string): boolean;
    record(requestId: string): void;
    private prune;
}
