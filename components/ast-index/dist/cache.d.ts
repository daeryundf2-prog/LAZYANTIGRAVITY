import { ProjectASTGraph } from "./types.js";
export declare function getCachePath(cwd?: string): string;
export declare function loadASTGraph(cwd?: string): ProjectASTGraph | null;
export declare function saveASTGraph(graph: ProjectASTGraph, cwd?: string): void;
export declare function scanSourceFiles(dir: string, fileList?: string[]): string[];
export declare function buildIncrementalASTGraph(targetDir?: string): ProjectASTGraph;
