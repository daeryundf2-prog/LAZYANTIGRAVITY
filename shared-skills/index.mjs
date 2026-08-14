import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const name = "@oh-my-opencode/shared-skills";
export const version = "0.3.3";

export function sharedSkillsRootPath() {
	return join(dirname(fileURLToPath(import.meta.url)), "skills");
}
