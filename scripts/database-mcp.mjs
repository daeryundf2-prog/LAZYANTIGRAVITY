#!/usr/bin/env node
import { stdin, stdout, env } from "node:process";
import { execSync } from "node:child_process";
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
	const { method, params, id } = message;
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
		const { name, arguments: args } = params;
		return handleToolCall(id, name, args);
	}
	sendError(id, -32601, `Method not found: ${method}`);
}

function handleToolCall(id, name, args) {
	try {
		let textResult = "";
		if (name === "db_discover_containers") {
			textResult = discoverContainers();
		} else if (name === "db_list_connections") {
			textResult = listConnections();
		} else if (name === "db_add_connection") {
			textResult = addConnection(args);
		} else if (name === "db_query") {
			textResult = executeQuery(args);
		} else {
			return sendError(id, -32601, `Tool not found: ${name}`);
		}
		
		return sendResponse(id, {
			content: [
				{
					type: "text",
					text: textResult
				}
			]
		});
	} catch (e) {
		return sendResponse(id, {
			content: [
				{
					type: "text",
					text: `Error executing tool '${name}': ${e.message}`
				}
			],
			isError: true
		});
	}
}

function discoverContainers() {
	try {
		const stdout = execSync('docker ps --format "{{.ID}}\\t{{.Names}}\\t{{.Ports}}\\t{{.Image}}"', {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"]
		});
		const lines = stdout.trim().split("\n").filter(Boolean);
		const containers = [];
		for (const line of lines) {
			const [cid, name, ports, image] = line.split("\t");
			let dbType = null;
			if (/postgres/i.test(image) || /postgres/i.test(name)) dbType = "postgresql";
			else if (/mysql/i.test(image) || /mysql/i.test(name)) dbType = "mysql";
			else if (/mariadb/i.test(image) || /mariadb/i.test(name)) dbType = "mariadb";
			else if (/mssql/i.test(image) || /sqlserver/i.test(name)) dbType = "mssql";
			else if (/cockroach/i.test(image) || /cockroach/i.test(name)) dbType = "cockroachdb";
			else if (/surreal/i.test(image) || /surreal/i.test(name)) dbType = "surrealdb";
			else if (/redis/i.test(image) || /redis/i.test(name)) dbType = "redis";
			
			if (dbType) {
				containers.push({ id: cid, name, ports, image, dbType });
			}
		}
		if (containers.length === 0) {
			return "No running database containers discovered.";
		}
		return JSON.stringify(containers, null, 2);
	} catch (e) {
		return "Docker CLI is not running or not available on the path.";
	}
}

function listConnections() {
	const configDir = getSqlitConfigDir();
	const connPath = join(configDir, "connections.json");
	if (existsSync(connPath)) {
		try {
			const connections = JSON.parse(readFileSync(connPath, "utf8"));
			return JSON.stringify(connections, null, 2);
		} catch (e) {
			return `Failed to parse connections.json at ${connPath}: ${e.message}`;
		}
	}
	return `No saved connections found in ${connPath}. You can add one using 'db_add_connection' or install 'sqlit-tui' to manage connections.`;
}

function addConnection(args) {
	const { name, dbType, url, server, port, database, username, password, filePath } = args;
	const configDir = getSqlitConfigDir();
	const connPath = join(configDir, "connections.json");
	
	let connections = {};
	if (existsSync(connPath)) {
		try {
			connections = JSON.parse(readFileSync(connPath, "utf8"));
		} catch (e) {
			// ignore and overwrite
		}
	} else {
		mkdirSync(configDir, { recursive: true });
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
	
	writeFileSync(connPath, JSON.stringify(connections, null, 2));
	return `Connection '${name}' successfully configured and saved to ${connPath}.`;
}

function executeQuery(args) {
	const { connectionName, connectionUrl, query, format = "json" } = args;
	
	// Priority 1: Direct SQLite connectionUrl fallback
	if (connectionUrl && (connectionUrl.startsWith("sqlite://") || connectionUrl.startsWith("sqlite:///"))) {
		const filePath = connectionUrl.replace(/^sqlite:\/\/\/?/, "");
		try {
			const formatFlag = format === "csv" ? "-csv" : (format === "json" ? "-json" : "-line");
			const output = execSync(`sqlite3 "${filePath}" ${formatFlag}`, {
				input: query,
				encoding: "utf8"
			});
			return output || "Query executed successfully (empty result set).";
		} catch (e) {
			return `Failed to execute SQLite query directly via sqlite3: ${e.message}\nEnsure 'sqlite3' CLI is installed.`;
		}
	}
	
	// Priority 2: Use sqlit command if available
	let sqlitAvailable = false;
	try {
		execSync("sqlit --version", { stdio: "ignore" });
		sqlitAvailable = true;
	} catch (e) {
		// sqlit not in path
	}
	
	if (sqlitAvailable) {
		try {
			let cmd = "";
			const formatFlag = format === "table" ? "table" : format;
			if (connectionName) {
				cmd = `sqlit query -c "${connectionName}" -q "${query.replace(/"/g, '\\"')}" --format ${formatFlag}`;
			} else if (connectionUrl) {
				cmd = `sqlit query --url "${connectionUrl}" -q "${query.replace(/"/g, '\\"')}" --format ${formatFlag}`;
			} else {
				return "Either connectionName or connectionUrl must be provided to run a query via sqlit.";
			}
			const output = execSync(cmd, { encoding: "utf8" });
			return output;
		} catch (e) {
			return `Failed to run query via sqlit CLI: ${e.message}`;
		}
	}
	
	// Priority 3: Fallback for SQLite saved connections
	if (connectionName) {
		const configDir = getSqlitConfigDir();
		const connPath = join(configDir, "connections.json");
		if (existsSync(connPath)) {
			try {
				const connections = JSON.parse(readFileSync(connPath, "utf8"));
				const conn = connections[connectionName];
				if (conn && conn.db_type === "sqlite" && conn.file_path) {
					const formatFlag = format === "csv" ? "-csv" : (format === "json" ? "-json" : "-line");
					const output = execSync(`sqlite3 "${conn.file_path}" ${formatFlag}`, {
						input: query,
						encoding: "utf8"
					});
					return output || "Query executed successfully (empty result set).";
				}
			} catch (e) {
				// fallback parsing failed
			}
		}
	}
	
	return "sqlit CLI is not installed or not in the PATH. Please install it using 'pipx install sqlit-tui' to run queries on non-SQLite databases.";
}
