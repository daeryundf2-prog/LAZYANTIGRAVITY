import { isUlwLoopDone } from "./goal-status.js";
import type { UlwLoopScope } from "./paths.js";
import { seedDefaultSuccessCriteria } from "./plan-crud.js";
import {
	appendLedger,
	readSteeringLedgerEntries,
	readUlwLoopPlan,
	withUlwLoopMutationLock,
	writePlan,
} from "./plan-io.js";
import {
	auditFor,
	child,
	children,
	childValues,
	hasProtected,
	isKind,
	isModel,
	isPlain,
	isSource,
	isText,
	pendingOrder,
	read,
	revised,
	targets,
	text,
	weakens,
} from "./steering-validation.js";
import type {
	SteerUlwLoopResult,
	UlwLoopItem,
	UlwLoopLedgerEntry,
	UlwLoopPlan,
	UlwLoopSteeringAudit,
	UlwLoopSteeringChildGoal,
	UlwLoopSteeringMutationKind,
	UlwLoopSteeringProposal,
} from "./types.js";
import { iso } from "./types.js";

function goal(plan: UlwLoopPlan, id: string | undefined): UlwLoopItem | undefined {
	return id === undefined ? undefined : plan.goals.find((item) => item.id === id);
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

function nextId(plan: UlwLoopPlan, offset: number): string {
	const max = plan.goals.reduce((current, item) => {
		const digits = /^G(\d+)(?:-|$)/u.exec(item.id)?.[1];
		return digits === undefined ? current : Math.max(current, Number(digits));
	}, 0);
	return `G${String(max + offset).padStart(3, "0")}`;
}

function makeGoal(
	plan: UlwLoopPlan,
	childGoal: UlwLoopSteeringChildGoal,
	evidence: string,
	now: string,
	offset: number,
): UlwLoopItem {
	const id = nextId(plan, offset);
	const digits = /^G(\d+)/u.exec(id)?.[1];
	const goalIndex = digits === undefined ? plan.goals.length + offset - 1 : Number(digits) - 1;
	return {
		id,
		title: childGoal.title,
		objective: childGoal.objective,
		status: "pending",
		successCriteria: seedDefaultSuccessCriteria(goalIndex, childGoal.objective),
		attempt: 0,
		createdAt: now,
		updatedAt: now,
		evidence,
	};
}

export function applySteeringMutation(
	plan: UlwLoopPlan,
	proposal: UlwLoopSteeringProposal,
	audit: UlwLoopSteeringAudit,
): UlwLoopPlan {
	const next = structuredClone(plan);
	if (!audit.invariant.accepted) return next;
	const now = proposal.now?.toISOString() ?? iso();
	if (proposal.kind === "add_subgoal")
		next.goals.push(
			makeGoal(
				next,
				{ title: proposal.title ?? "", objective: proposal.objective ?? "" },
				proposal.evidence,
				now,
				1,
			),
		);
	if (proposal.kind === "reorder_pending") {
		const order = pendingOrder(proposal);
		next.goals = [
			...order.map((id) => goal(next, id)).filter((item): item is UlwLoopItem => item !== undefined),
			...next.goals.filter((item) => !order.includes(item.id)),
		];
	}
	if (proposal.kind === "revise_pending_wording") reviseWording(next, proposal, now);
	if (proposal.kind === "split_subgoal" || proposal.kind === "mark_blocked_superseded")
		splitOrBlock(next, proposal, now);
	if (proposal.kind === "revise_criterion") reviseCriterion(next, proposal, now);
	if (proposal.kind !== "annotate_ledger") next.updatedAt = now;
	return next;
}

function reviseWording(plan: UlwLoopPlan, proposal: UlwLoopSteeringProposal, now: string): void {
	const target = goal(plan, targets(proposal)[0]);
	if (target === undefined) return;
	target.title = revised(proposal, "revisedTitle", "title") ?? target.title;
	target.objective = revised(proposal, "revisedObjective", "objective") ?? target.objective;
	target.steeringEvidence = proposal.evidence;
	target.steeringRationale = proposal.rationale;
	target.updatedAt = now;
}

function splitOrBlock(plan: UlwLoopPlan, proposal: UlwLoopSteeringProposal, now: string): void {
	const target = goal(plan, targets(proposal)[0]);
	if (target === undefined) return;
	const replacements = children(proposal).map((item, index) =>
		makeGoal(plan, item, proposal.evidence, now, index + 1),
	);
	target.steeringEvidence = proposal.evidence;
	target.steeringRationale = proposal.rationale;
	target.updatedAt = now;
	if (replacements.length === 0) {
		target.status = "blocked";
		target.steeringStatus = "blocked";
		target.blockedReason = proposal.blockedReason ?? proposal.rationale;
	} else {
		target.steeringStatus = "superseded";
		target.supersededBy = replacements.map((item) => item.id);
		for (const item of replacements) item.supersedes = [target.id];
		plan.goals.splice(plan.goals.indexOf(target) + 1, 0, ...replacements);
	}
	if (plan.activeGoalId === target.id) delete plan.activeGoalId;
}

function reviseCriterion(plan: UlwLoopPlan, proposal: UlwLoopSteeringProposal, now: string): void {
	const target = goal(plan, targets(proposal)[0]);
	const index = target?.successCriteria.findIndex((item) => item.id === proposal.criterionId) ?? -1;
	const current = target?.successCriteria[index];
	if (target === undefined || current === undefined) return;
	const model = read(proposal, "userModel");
	target.successCriteria[index] = {
		...current,
		scenario: text(proposal, "scenario") ?? current.scenario,
		expectedEvidence: text(proposal, "expectedEvidence") ?? current.expectedEvidence,
		userModel: isModel(model) ? model : current.userModel,
	};
	target.updatedAt = now;
}

function isProposal(value: unknown): value is UlwLoopSteeringProposal {
	return (
		isPlain(value) &&
		isKind(read(value, "kind")) &&
		isSource(read(value, "source")) &&
		isText(read(value, "evidence")) &&
		isText(read(value, "rationale"))
	);
}

export function parseUlwLoopSteeringDirective(text: string): UlwLoopSteeringProposal | null {
	const match =
		/(?:^|\s)(?:LAZYANTIGRAVITY_ULW_LOOP_STEER|OMO_ULW_LOOP_STEER|lazyantigravity\.ulw-loop\.steer|omo\.ulw-loop\.steer|lazyantigravity ulw-loop steer|omo ulw-loop steer):\s*([\s\S]+)$/u.exec(
			text,
		);
	if (match?.[1] === undefined) return null;
	try {
		const parsed: unknown = JSON.parse(match[1].trim());
		return isProposal(parsed) ? parsed : null;
	} catch (error) {
		if (error instanceof SyntaxError) return null;
		throw error;
	}
}

export async function steerUlwLoop(
	repoRoot: string,
	proposal: UlwLoopSteeringProposal,
	scope?: UlwLoopScope,
): Promise<SteerUlwLoopResult> {
	return withUlwLoopMutationLock(repoRoot, scope, async () => {
		const plan = await readUlwLoopPlan(repoRoot, scope);
		const key = proposal.idempotencyKey ?? proposal.promptSignature;
		const prior =
			key === undefined
				? undefined
				: (await readSteeringLedgerEntries(repoRoot, scope)).find(
						(entry) =>
							entry.steering?.invariant.accepted === true &&
							(entry.idempotencyKey === key ||
								entry.steering.idempotencyKey === key ||
								entry.steering.promptSignature === key),
					);
		if (prior?.steering !== undefined)
			return {
				plan,
				accepted: true,
				audit: { ...prior.steering, deduped: true },
				rejectedReasons: [],
				deduped: true,
			};
		const audit = validateUlwLoopSteeringProposal(plan, proposal);
		const accepted = audit.invariant.accepted;
		const next = accepted ? applySteeringMutation(plan, proposal, audit) : plan;
		const finalAudit: UlwLoopSteeringAudit = { ...audit, before: plan };
		if (accepted) finalAudit.after = next;
		if (accepted) await writePlan(repoRoot, next, scope);
		await appendLedger(repoRoot, ledgerEntry(proposal, finalAudit, proposal.now?.toISOString() ?? iso()), scope);
		return {
			plan: next,
			accepted,
			audit: finalAudit,
			rejectedReasons: audit.invariant.rejectedReasons,
			deduped: false,
		};
	});
}

function ledgerEntry(proposal: UlwLoopSteeringProposal, audit: UlwLoopSteeringAudit, at: string): UlwLoopLedgerEntry {
	const entry: UlwLoopLedgerEntry = {
		at,
		kind: audit.invariant.accepted
			? proposal.kind === "revise_criterion"
				? "criteria_revised"
				: "steering_accepted"
			: "steering_rejected",
		evidence: proposal.evidence,
		message: proposal.rationale,
		steering: audit,
		mutationKind: proposal.kind,
	};
	const goalId = audit.targetGoalIds[0];
	if (goalId !== undefined) entry.goalId = goalId;
	if (proposal.criterionId !== undefined) entry.criterionId = proposal.criterionId;
	if (proposal.idempotencyKey !== undefined) entry.idempotencyKey = proposal.idempotencyKey;
	if (audit.before !== undefined) entry.before = audit.before;
	if (audit.after !== undefined) entry.after = audit.after;
	return entry;
}
