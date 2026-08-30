export interface RawParsedTableRow {
    readonly [column: string]: string;
}
export declare function extractRegistrableDomain(hostname: string): string;
export declare function extractUrls(text: string): string[];
export declare function extractUniqueDomains(text: string): string[];
export declare function parseMarkdownTable(markdown: string): RawParsedTableRow[];
