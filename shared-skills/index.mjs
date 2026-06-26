import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function sharedSkillsRootPath() {
	return join(dirname(fileURLToPath(import.meta.url)), "skills");
}
