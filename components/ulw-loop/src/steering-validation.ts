import type {
	UlwLoopSteeringAudit,
	UlwLoopSteeringChildGoal,
	UlwLoopSteeringMutationKind,
	UlwLoopSteeringSource,
	UlwLoopSuccessCriterionUserModel,
} from "./types.js";
import { ULW_LOOP_STEERING_MUTATION_KINDS, ULW_LOOP_SUCCESS_CRITERION_USER_MODELS } from "./types.js";

export const SOURCES = ["user_prompt_submit", "finding", "cli"] as const satisfies readonly UlwLoopSteeringSource[];
export const PROTECTED = new Set(["aggregateCompletion", "codexObjective", "codexObjectiveAliases", "originalConstraints", "qualityGate", "status", "completedAt", "completionStatus"]);

export const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;
export const isPlain = (value: unknown): value is object => isObject(value) && !Array.isArray(value);
export const read = (value: object, key: string): unknown => Object.entries(value).find(([name]) => name === key)?.[1];
export const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
export const text = (value: object, key: string): string | undefined => {
	const candidate = read(value, key);
	return isText(candidate) ? candidate.trim() : undefined;
};
export const isKind = (value: unknown): value is UlwLoopSteeringMutationKind => typeof value === "string" && ULW_LOOP_STEERING_MUTATION_KINDS.some((kind) => kind === value);
export const isSource = (value: unknown): value is UlwLoopSteeringSource => typeof value === "string" && SOURCES.some((source) => source === value);
export const isModel = (value: unknown): value is UlwLoopSuccessCriterionUserModel => typeof value === "string" && ULW_LOOP_SUCCESS_CRITERION_USER_MODELS.some((model) => model === value);
export const texts = (value: object, key: string): string[] => {
	const candidate = read(value, key);
	return Array.isArray(candidate) && candidate.every((item) => typeof item === "string") ? candidate : [];
};

export function targets(proposal: object): string[] {
	const many = texts(proposal, "targetGoalIds");
	const one = text(proposal, "targetGoalId") ?? text(proposal, "goalId");
	return many.length > 0 ? many : one === undefined ? [] : [one];
}

export const after = (proposal: object): object | undefined => {
	const candidate = read(proposal, "after");
	return isPlain(candidate) ? candidate : undefined;
};
export const revised = (proposal: object, direct: string, nested: string): string | undefined => text(proposal, direct) ?? text(after(proposal) ?? proposal, nested);

export function child(value: unknown): UlwLoopSteeringChildGoal | null {
	if (!isPlain(value)) return null;
	const title = text(value, "title");
	const objective = text(value, "objective");
	if (title === undefined || objective === undefined) return null;
	return { title, objective };
}

export function childValues(proposal: object): unknown[] {
	const direct = read(proposal, "childGoals");
	if (Array.isArray(direct) && direct.length > 0) return direct;
	const nested = after(proposal);
	const fromAfter = nested === undefined ? undefined : read(nested, "children");
	return Array.isArray(fromAfter) ? fromAfter : [];
}

export const children = (proposal: object): UlwLoopSteeringChildGoal[] => childValues(proposal).map(child).filter((item): item is UlwLoopSteeringChildGoal => item !== null);
export const pendingOrder = (proposal: object): string[] => {
	const direct = texts(proposal, "pendingOrder");
	return direct.length > 0 ? direct : texts(after(proposal) ?? proposal, "pendingGoalIds");
};

export function hasProtected(value: unknown): boolean {
	if (!isObject(value)) return false;
	for (const [key, childValue] of Object.entries(value)) if (PROTECTED.has(key) || key.toLowerCase().includes("complete") || hasProtected(childValue)) return true;
	return false;
}

export function allText(value: unknown): string {
	if (typeof value === "string") return value;
	return isObject(value) ? Object.values(value).map(allText).filter(Boolean).join("\n") : "";
}

export function weakens(value: unknown): boolean {
	const valueText = allText(value).toLowerCase();
	return /\b(skip|bypass|weaken|remove|omit|auto[-\s]?complete|mark complete|complete faster)\b/.test(valueText) && /\b(test|tests|verification|review|quality gate|complete|completion)\b/.test(valueText);
}

export function auditFor(proposal: unknown, reasons: string[]): UlwLoopSteeringAudit {
	const object = isPlain(proposal) ? proposal : undefined;
	const kindRaw = object === undefined ? undefined : read(object, "kind");
	const sourceRaw = object === undefined ? undefined : read(object, "source");
	const evidence = object === undefined ? "" : (text(object, "evidence") ?? "");
	const rationale = object === undefined ? "" : (text(object, "rationale") ?? "");
	const audit: UlwLoopSteeringAudit = { kind: isKind(kindRaw) ? kindRaw : "annotate_ledger", source: isSource(sourceRaw) ? sourceRaw : "cli", targetGoalIds: object === undefined ? [] : targets(object), evidence, rationale, invariant: { accepted: reasons.length === 0, structuralInvariantAccepted: reasons.length === 0, evidenceBackedNecessity: evidence.length > 0 && rationale.length > 0, noEasierCompletion: !weakens(proposal), rejectedReasons: reasons, reasons } };
	if (object === undefined) return audit;
	const criterionId = text(object, "criterionId");
	const directiveText = text(object, "directiveText");
	const promptSignature = text(object, "promptSignature");
	const idempotencyKey = text(object, "idempotencyKey");
	if (criterionId !== undefined) audit.criterionId = criterionId;
	if (directiveText !== undefined) audit.directiveText = directiveText;
	if (promptSignature !== undefined) audit.promptSignature = promptSignature;
	if (idempotencyKey !== undefined) audit.idempotencyKey = idempotencyKey;
	return audit;
}
