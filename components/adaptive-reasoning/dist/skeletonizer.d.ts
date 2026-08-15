export interface SkeletonizeResult {
    originalLength: number;
    skeletonLength: number;
    compressionRatio: number;
    skeleton: string;
}
/**
 * Extracts structural declarations (interfaces, types, function signatures, class skeletons)
 * while replacing deep function/method implementations with minimal stubs.
 */
export declare function skeletonizeCode(source: string, filename?: string): SkeletonizeResult;
