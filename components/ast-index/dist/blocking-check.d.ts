export interface BlockingFinding {
    file: string;
    line: number;
    rule: "sync-io-in-async" | "ignored-result";
    detail: string;
}
export declare function checkFileBlocking(filePath: string): BlockingFinding[];
export declare function checkBlocking(targetDir: string): BlockingFinding[];
