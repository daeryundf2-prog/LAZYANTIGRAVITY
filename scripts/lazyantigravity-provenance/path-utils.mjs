export function pathContains(surfacePath, candidatePath) {
	const surface = stripTrailingSlash(surfacePath);
	const candidate = stripTrailingSlash(candidatePath);
	return candidate === surface || candidate.startsWith(`${surface}/`) || surface.startsWith(`${candidate}/`);
}

export function compareByPath(left, right) {
	return left.path.localeCompare(right.path);
}

export function normalizePath(path) {
	return path.split("\\").join("/");
}

function stripTrailingSlash(path) {
	return normalizePath(path).replace(/\/+$/, "");
}
