#!/usr/bin/env node
import { stdin, stdout, env } from "node:process";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Buffer to store incoming data
let buffer = "";

stdin.on("data", (chunk) => {
	buffer += chunk.toString();
	processMessages();
});

function processMessages() {
	while (true) {
		const newlineIndex = buffer.indexOf("\n");
		if (newlineIndex === -1) break;
		const line = buffer.slice(0, newlineIndex).trim();
		buffer = buffer.slice(newlineIndex + 1);
		if (line) {
			try {
				const message = JSON.parse(line);
				handleMessage(message);
			} catch (e) {
				sendError(null, -32700, "Parse error");
			}
		}
	}
}

function sendResponse(id, result) {
	stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function sendError(id, code, message, data) {
	stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message, data } }) + "\n");
}

function getSqlitConfigDir() {
	if (env.SQLIT_CONFIG_DIR) return env.SQLIT_CONFIG_DIR;
	const home = env.HOME || env.USERPROFILE || "";
	return join(home, ".config", "sqlit");
}

function handleMessage(message) {
	if (!message || typeof message !== "object") {
		return sendError(null, -32600, "Invalid Request");
	}
	
	const { method, params, id } = message;
	
	// Safe routing with try-catch to avoid crashing the stdin process
	try {
		if (method === "initialize") {
			return sendResponse(id, {
				protocolVersion: "2024-11-05",
				capabilities: {
					tools: {}
				},
				serverInfo: {
					name: "sqlit-database-mcp",
					version: "1.0.0"
				}
			});
		}
		if (method === "notifications/initialized") {
			return;
		}
		if (method === "tools/list") {
			return sendResponse(id, {
				tools: [
					{
						name: "db_discover_containers",
						description: "Automatically discover running Docker database containers (PostgreSQL, MySQL, MS SQL, etc.) and list their port mappings and details.",
						inputSchema: {
							type: "object",
							properties: {}
						}
					},
					{
						name: "db_query",
						description: "Execute a SQL query against a database connection or a direct connection URL using sqlit CLI.",
						inputSchema: {
							type: "object",
							properties: {
								connectionName: {
									type: "string",
									description: "Name of the saved sqlit connection."
								},
								connectionUrl: {
									type: "string",
									description: "Direct connection URL (e.g., sqlite:///path/to/db.db, postgresql://user:pass@localhost:5432/db)."
								},
								query: {
									type: "string",
									description: "The SQL query to execute."
								},
								format: {
									type: "string",
									enum: ["json", "csv", "table"],
									description: "Output format of the query result (default: json)."
								}
							},
							required: ["query"]
						}
					},
					{
						name: "db_list_connections",
						description: "List all saved database connections in sqlit connection manager.",
						inputSchema: {
							type: "object",
							properties: {}
						}
					},
					{
						name: "db_add_connection",
						description: "Save a new database connection configuration in sqlit.",
						inputSchema: {
							type: "object",
							properties: {
								name: {
									type: "string",
									description: "Unique name for the connection."
								},
								dbType: {
									type: "string",
									enum: ["sqlite", "postgresql", "mysql", "mssql", "cockroachdb", "turso"],
									description: "Type of the database."
								},
								url: {
									type: "string",
									description: "Connection URL (alternative to individual parameters)."
								},
								server: {
									type: "string",
									description: "Database server host."
								},
								port: {
									type: "string",
									description: "Database server port."
								},
								database: {
									type: "string",
									description: "Database name."
								},
								username: {
									type: "string",
									description: "Database username."
								},
								password: {
									type: "string",
									description: "Database password."
								},
								filePath: {
									type: "string",
									description: "File path for SQLite database."
								}
							},
							required: ["name", "dbType"]
						}
					}
				]
			});
		}
		if (method === "tools/call") {
			if (!params || typeof params !== "object") {
				return sendError(id, -32602, "Invalid params: params object is required");
			}
			const { name, arguments: args } = params;
			if (!name || typeof name !== "string") {
				return sendError(id, -32602, "Invalid params: name must be a string");
			}
			return handleToolCall(id, name, args || {});
		}
		sendError(id, -32601, `Method not found: ${method}`);
	} catch (e) {
		sendError(id, -32603, `Internal error: ${e.message}`);
	}
}

function handleToolCall(id, name, args) {
	try {
		let textResult = "";
		let isError = false;

		if (name === "db_discover_containers") {
			const res = discoverContainers();
			textResult = res.textResult;
			isError = res.isError;
		} else if (name === "db_list_connections") {
			const res = listConnections();
			textResult = res.textResult;
			isError = res.isError;
		} else if (name === "db_add_connection") {
			const res = addConnection(args);
			textResult = res.textResult;
			isError = res.isError;
		} else if (name === "db_query") {
			const res = executeQuery(args);
			textResult = res.textResult;
			isError = res.isError;
		} else {
			return sendError(id, -32601, `Tool not found: ${name}`);
		}
		
		return sendResponse(id, {
			content: [
				{
					type: "text",
					text: textResult
				}
			],
			isError
		});
	} catch (e) {
		return sendResponse(id, {
			content: [
				{
					type: "text",
					text: `Unexpected internal error executing tool '${name}': ${e.message}`
				}
			],
			isError: true
		});
	}
}

function discoverContainers() {
	try {
		// Use execFileSync to execute docker CLI securely with arguments separated
		const stdout = execFileSync(
			"docker",
			["ps", "--format", "{{.ID}}\t{{.Names}}\t{{.Ports}}\t{{.Image}}"],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
		);
		const lines = stdout.trim().split("\n").filter(Boolean);
		const containers = [];
		for (const line of lines) {
			const [cid, name, ports, image] = line.split("\t");
			if (!cid || !name) continue;
			
			let dbType = null;
			const target = `${image || ""} ${name}`;
			if (/postgres/i.test(target)) dbType = "postgresql";
			else if (/mysql/i.test(target)) dbType = "mysql";
			else if (/mariadb/i.test(target)) dbType = "mariadb";
			else if (/mssql|sqlserver/i.test(target)) dbType = "mssql";
			else if (/cockroach/i.test(target)) dbType = "cockroachdb";
			else if (/surreal/i.test(target)) dbType = "surrealdb";
			else if (/redis/i.test(target)) dbType = "redis";
			
			if (dbType) {
				containers.push({ id: cid, name, ports: ports || "", image: image || "", dbType });
			}
		}
		if (containers.length === 0) {
			return { textResult: "No running database containers discovered.", isError: false };
		}
		return { textResult: JSON.stringify(containers, null, 2), isError: false };
	} catch (e) {
		return { 
			textResult: "Docker CLI is not running or not available on the path.", 
			isError: false
		};
	}
}

function listConnections() {
	const configDir = getSqlitConfigDir();
	const connPath = join(configDir, "connections.json");
	if (existsSync(connPath)) {
		try {
			const connections = JSON.parse(readFileSync(connPath, "utf8"));
			return { textResult: JSON.stringify(connections, null, 2), isError: false };
		} catch (e) {
			return { textResult: `Failed to parse connections.json at ${connPath}: ${e.message}`, isError: true };
		}
	}
	return { 
		textResult: `No saved connections found in ${connPath}. You can add one using 'db_add_connection' or install 'sqlit-tui' to manage connections.`, 
		isError: false 
	};
}

function addConnection(args) {
	const { name, dbType, url, server, port, database, username, password, filePath } = args;
	
	// Basic Validation
	if (!name || typeof name !== "string") {
		return { textResult: "Validation failed: 'name' is required and must be a string.", isError: true };
	}
	if (dbType === "sqlite" && !filePath && !url) {
		return { textResult: "Validation failed: 'filePath' or 'url' is required for SQLite connections.", isError: true };
	}

	const configDir = getSqlitConfigDir();
	const connPath = join(configDir, "connections.json");
	
	let connections = {};
	if (existsSync(connPath)) {
		try {
			connections = JSON.parse(readFileSync(connPath, "utf8"));
		} catch (e) {
			// ignore corruption and overwrite
		}
	} else {
		try {
			mkdirSync(configDir, { recursive: true });
		} catch (e) {
			return { textResult: `Failed to create config directory: ${e.message}`, isError: true };
		}
	}
	
	connections[name] = {
		db_type: dbType,
		url,
		server,
		port,
		database,
		username,
		password,
		file_path: filePath,
		created_at: new Date().toISOString()
	};
	
	try {
		writeFileSync(connPath, JSON.stringify(connections, null, 2));
		return { textResult: `Connection '${name}' successfully configured and saved to ${connPath}.`, isError: false };
	} catch (e) {
		return { textResult: `Failed to write connection: ${e.message}`, isError: true };
	}
}

function executeQuery(args) {
	const { connectionName, connectionUrl, query, format = "json" } = args;
	if (!query) {
		return { textResult: "Validation failed: 'query' parameter is required.", isError: true };
	}

	const formatFlag = format === "csv" ? "-csv" : (format === "json" ? "-json" : "-line");
	
	// Priority 1: Direct SQLite connectionUrl fallback (Safe from injection)
	if (connectionUrl && (connectionUrl.startsWith("sqlite://") || connectionUrl.startsWith("sqlite:///"))) {
		const filePath = connectionUrl.replace(/^sqlite:\/\/\/?/, "");
		try {
			const output = execFileSync("sqlite3", [filePath, formatFlag], {
				input: query,
				encoding: "utf8"
			});
			return { textResult: output || "Query executed successfully (empty result set).", isError: false };
		} catch (e) {
			return { 
				textResult: `Failed to execute SQLite query directly via sqlite3: ${e.message}\nEnsure 'sqlite3' CLI is installed.`, 
				isError: true 
			};
		}
	}
	
	// Priority 2: Use sqlit command if available (Safe from injection)
	let sqlitAvailable = false;
	try {
		execFileSync("sqlit", ["--version"], { stdio: "ignore" });
		sqlitAvailable = true;
	} catch (e) {
		// sqlit not in path
	}
	
	if (sqlitAvailable) {
		try {
			const formatFlagSqlit = format === "table" ? "table" : format;
			const sqlitArgs = ["query"];
			if (connectionName) {
				sqlitArgs.push("-c", connectionName);
			} else if (connectionUrl) {
				sqlitArgs.push("--url", connectionUrl);
			} else {
				return { textResult: "Either connectionName or connectionUrl must be provided to run a query via sqlit.", isError: true };
			}
			sqlitArgs.push("-q", query, "--format", formatFlagSqlit);
			
			const output = execFileSync("sqlit", sqlitArgs, { encoding: "utf8" });
			return { textResult: output, isError: false };
		} catch (e) {
			return { textResult: `Failed to run query via sqlit CLI: ${e.message}`, isError: true };
		}
	}
	
	// Priority 3: Fallback for SQLite saved connections (Safe from injection)
	if (connectionName) {
		const configDir = getSqlitConfigDir();
		const connPath = join(configDir, "connections.json");
		if (existsSync(connPath)) {
			try {
				const connections = JSON.parse(readFileSync(connPath, "utf8"));
				const conn = connections[connectionName];
				if (conn && conn.db_type === "sqlite" && conn.file_path) {
					const output = execFileSync("sqlite3", [conn.file_path, formatFlag], {
						input: query,
						encoding: "utf8"
					});
					return { textResult: output || "Query executed successfully (empty result set).", isError: false };
				}
			} catch (e) {
				// fallback parsing failed
			}
		}
	}
	
	return { 
		textResult: "sqlit CLI is not installed or not in the PATH. Please install it using 'pipx install sqlit-tui' to run queries on non-SQLite databases.", 
		isError: true 
	};
}
