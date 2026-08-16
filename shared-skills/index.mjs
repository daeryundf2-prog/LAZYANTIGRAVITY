import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const name = "@lazyantigravity/shared-skills";
export const version = "0.5.0";

export function sharedSkillsRootPath() {
	return join(dirname(fileURLToPath(import.meta.url)), "skills");
}
