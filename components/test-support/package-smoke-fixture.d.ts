export type PackageJson = {
	readonly [key: string]: unknown;
	readonly type?: string;
	readonly packageManager?: string;
	readonly dependencies?: Record<string, string>;
	readonly optionalDependencies?: Record<string, string>;
	readonly bin: Record<string, string | undefined>;
	readonly files?: readonly string[];
	readonly scripts?: Record<string, string | undefined>;
};

export type HooksJson = {
	readonly hooks: Record<string, readonly { readonly matcher?: string; readonly hooks: readonly { readonly command?: string }[] }[]>;
};

export type McpJson = {
	readonly mcpServers: Record<string, { readonly command?: string; readonly args?: readonly string[] } | undefined>;
};

export type PluginJson = {
	readonly hooks?: string;
};

export declare function readTextFile(relativePath: string): string;
export declare function readJsonFile(relativePath: string): unknown;
export declare function readPackageJson(relativePath: string): PackageJson;
export declare function readHooksJson(relativePath: string): HooksJson;
export declare function readMcpJson(relativePath: string): McpJson;
export declare function readPluginJson(relativePath: string): PluginJson;
export declare function listDirectoryEntries(relativePath: string): string[];
export declare function requireFiles(packageJson: PackageJson, sourcePath: string): readonly string[];
export declare function requireScripts(packageJson: PackageJson, sourcePath: string): Record<string, string | undefined>;
export declare function collectHookCommandsFromValue(value: unknown): string[];
