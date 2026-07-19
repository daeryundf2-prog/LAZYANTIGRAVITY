export function detectRuntime(env = process.env) {
	return "antigravity";
}

export function getRuntimeConfig(env = process.env) {
	return {
		productName: "LazyAntigravity",
		autoUpdateEnabled: false,
		configMigrationEnabled: false,
	};
}
