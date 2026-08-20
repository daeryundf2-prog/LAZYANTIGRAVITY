import { isUlwLoopDone } from "./goal-status.js";
import type {
	UlwLoopItem,
	UlwLoopPlan,
	UlwLoopSteeringAudit,
	UlwLoopSteeringChildGoal,
	UlwLoopSteeringMutationKind,
	UlwLoopSteeringSource,
	UlwLoopSuccessCriterionUserModel,
} from "./types.js";
import { ULW_LOOP_STEERING_MUTATION_KINDS, ULW_LOOP_SUCCESS_CRITERION_USER_MODELS } from "./types.js";

export const SOURCES = ["user_prompt_submit", "finding", "cli"] as const satisfies readonly UlwLoopSteeringSource[];
export const PROTECTED = new Set([
	"aggregateCompletion",
	"codexObjective",
	"codexObjectiveAliases",
	"originalConstraints",
	"qualityGate",
	"status",
	"completedAt",
	"completionStatus",
]);

export const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;
export const isPlain = (value: unknown): value is object => isObject(value) && !Array.isArray(value);
export const read = (value: object, key: string): unknown => Object.entries(value).find(([name]) => name === key)?.[1];
export const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
export const text = (value: object, key: string): string | undefined => {
	const candidate = read(value, key);
	return isText(candidate) ? candidate.trim() : undefined;
};
export const isKind = (value: unknown): value is UlwLoopSteeringMutationKind =>
	typeof value === "string" && ULW_LOOP_STEERING_MUTATION_KINDS.some((kind) => kind === value);
export const isSource = (value: unknown): value is UlwLoopSteeringSource =>
	typeof value === "string" && SOURCES.some((source) => source === value);
export const isModel = (value: unknown): value is UlwLoopSuccessCriterionUserModel =>
	typeof value === "string" && ULW_LOOP_SUCCESS_CRITERION_USER_MODELS.some((model) => model === value);
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
export const revised = (proposal: object, direct: string, nested: string): string | undefined =>
	text(proposal, direct) ?? text(after(proposal) ?? proposal, nested);

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

export const children = (proposal: object): UlwLoopSteeringChildGoal[] =>
	childValues(proposal)
		.map(child)
		.filter((item): item is UlwLoopSteeringChildGoal => item !== null);
export const pendingOrder = (proposal: object): string[] => {
	const direct = texts(proposal, "pendingOrder");
	return direct.length > 0 ? direct : texts(after(proposal) ?? proposal, "pendingGoalIds");
};

export function hasProtected(value: unknown): boolean {
	if (!isObject(value)) return false;
	for (const [key, childValue] of Object.entries(value))
		if (PROTECTED.has(key) || key.toLowerCase().includes("complete") || hasProtected(childValue)) return true;
	return false;
}

export function allText(value: unknown): string {
	if (typeof value === "string") return value;
	return isObject(value) ? Object.values(value).map(allText).filter(Boolean).join("\n") : "";
}

export function weakens(value: unknown): boolean {
	const valueText = allText(value).toLowerCase();
	return (
		/\b(skip|bypass|weaken|remove|omit|auto[-\s]?complete|mark complete|complete faster)\b/.test(valueText) &&
		/\b(test|tests|verification|review|quality gate|complete|completion)\b/.test(valueText)
	);
}

export function auditFor(proposal: unknown, reasons: string[]): UlwLoopSteeringAudit {
	const object = isPlain(proposal) ? proposal : undefined;
	const kindRaw = object === undefined ? undefined : read(object, "kind");
	const sourceRaw = object === undefined ? undefined : read(object, "source");
	const evidence = object === undefined ? "" : (text(object, "evidence") ?? "");
	const rationale = object === undefined ? "" : (text(object, "rationale") ?? "");
	const audit: UlwLoopSteeringAudit = {
		kind: isKind(kindRaw) ? kindRaw : "annotate_ledger",
		source: isSource(sourceRaw) ? sourceRaw : "cli",
		targetGoalIds: object === undefined ? [] : targets(object),
		evidence,
		rationale,
		invariant: {
			accepted: reasons.length === 0,
			structuralInvariantAccepted: reasons.length === 0,
			evidenceBackedNecessity: evidence.length > 0 && rationale.length > 0,
			noEasierCompletion: !weakens(proposal),
			rejectedReasons: reasons,
			reasons,
		},
	};
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

function goal(plan: UlwLoopPlan, id: string | undefined): UlwLoopItem | undefined {
	return id === undefined ? undefined : plan.goals.find((item) => item.id === id);
}

function validateOrder(plan: UlwLoopPlan, proposal: object, reasons: string[]): void {
	const requested = pendingOrder(proposal);
	const pending = plan.goals
		.filter((item) => item.status === "pending" && item.steeringStatus === undefined)
		.map((item) => item.id);
	if (requested.length === 0) reasons.push("reorder_pending requires ids");
	if (new Set(requested).size !== requested.length) reasons.push("duplicate pending id");
	if (requested.some((id) => !pending.includes(id))) reasons.push("unknown pending id");
}

function validateCriterion(plan: UlwLoopPlan, proposal: object, reasons: string[]): void {
	const target = goal(plan, targets(proposal)[0]);
	const criterionId = text(proposal, "criterionId");
	if (target === undefined) reasons.push("revise_criterion requires goalId");
	else if (criterionId === undefined || target.successCriteria.every((item) => item.id !== criterionId))
		reasons.push("revise_criterion requires criterionId");
	const model = read(proposal, "userModel");
	if (
		read(proposal, "scenario") === undefined &&
		read(proposal, "expectedEvidence") === undefined &&
		model === undefined
	)
		reasons.push("revise_criterion requires update");
	if (model !== undefined && !isModel(model)) reasons.push("invalid userModel");
}

function validateKind(plan: UlwLoopPlan, proposal: object, kind: UlwLoopSteeringMutationKind, reasons: string[]): void {
	const target = goal(plan, targets(proposal)[0]);
	if (kind === "add_subgoal" && (text(proposal, "title") === undefined || text(proposal, "objective") === undefined))
		reasons.push("add_subgoal requires title/objective");
	if (
		(kind === "split_subgoal" || kind === "revise_pending_wording" || kind === "mark_blocked_superseded") &&
		target === undefined
	)
		reasons.push(`${kind} requires target`);
	if (
		(kind === "split_subgoal" || kind === "revise_pending_wording") &&
		target !== undefined &&
		target.status !== "pending"
	)
		reasons.push(`${kind} requires pending target`);
	const rawChildren = childValues(proposal);
	if (kind === "split_subgoal" && rawChildren.length === 0) reasons.push("split_subgoal requires children");
	if (
		(kind === "split_subgoal" || kind === "mark_blocked_superseded") &&
		rawChildren.some((item) => child(item) === null)
	)
		reasons.push(`${kind} children require title/objective`);
	if (kind === "reorder_pending") validateOrder(plan, proposal, reasons);
	if (
		kind === "revise_pending_wording" &&
		revised(proposal, "revisedTitle", "title") === undefined &&
		revised(proposal, "revisedObjective", "objective") === undefined
	)
		reasons.push("revise_pending_wording requires update");
	if (kind === "revise_criterion") validateCriterion(plan, proposal, reasons);
}

export function validateUlwLoopSteeringProposal(plan: UlwLoopPlan, proposal: unknown): UlwLoopSteeringAudit {
	const reasons: string[] = [];
	if (!isPlain(proposal)) reasons.push("proposal must be an object");
	const object = isPlain(proposal) ? proposal : {};
	const kind = read(object, "kind");
	if (!isKind(kind)) reasons.push(`invalid kind: ${String(kind)}`);
	if (!isSource(read(object, "source"))) reasons.push(`invalid source: ${String(read(object, "source"))}`);
	if (text(object, "evidence") === undefined) reasons.push("missing evidence");
	if (text(object, "rationale") === undefined) reasons.push("missing rationale");
	if (hasProtected(proposal)) reasons.push("protected payload");
	if (weakens(proposal)) reasons.push("weakened completion");
	if (isUlwLoopDone(plan)) reasons.push("plan already complete");
	if (isKind(kind)) validateKind(plan, object, kind, reasons);
	return auditFor(proposal, reasons);
}
