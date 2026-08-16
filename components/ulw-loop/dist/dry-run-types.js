export const SCENARIO_NAMES = [
    "happy-path",
    "quota-opus-exhausted",
    "context-window-exceeded",
    "output-token-limit",
    "provider-unavailable",
    "subagent-self-finalizes",
    "stale-heartbeat-missed",
    "polling-loop-prevented",
    "parent-progress-reconstruct",
    "subagent-wrong-role-envelope",
    "same-error-loop",
    "oscillating-patch",
    "heartbeat-only-stall",
    "no-evidence-progress",
    "quality-happy-path",
    "quality-mechanical-fail",
    "quality-semantic-insufficient-evidence",
    "quality-consensus-required",
    "quality-stagnation-unresolved",
    "hitl-scenario",
    "rewind-preview",
    "rewind-create-branch",
    "rewind-destructive-requires-flag",
    "rewind-invalid-event-id",
    "rewind-preserves-original-ledger",
    "consensus-happy-path",
    "consensus-devil-rejects",
    "consensus-regression-risk",
    "consensus-security-state-risk",
    "consensus-inconclusive",
    "consensus-self-finalizes-rejected",
    "consensus-dispatcher-runtime",
    "consensus-dispatch-invalid-envelope",
    "consensus-dispatch-antigravity-inherits-model",
    "consensus-live-invocation",
];
export const DRY_RUN_HELP = `Usage:
  omo ulw-loop dry-run [--scenario <scenario>] [--json] [--write-checkpoint | --persist-checkpoint]

Scenarios:
  happy-path                 Simulates a fully successful role execution flow without errors
  quota-opus-exhausted       Simulates a Claude Opus quota exhausted / model_rate_limited failure
  context-window-exceeded    Simulates context window limit hit with Compact Mode transition
  output-token-limit         Simulates output token limit hit with Batch Mode transition
  provider-unavailable       Simulates provider API endpoint down with retry mitigation
  subagent-self-finalizes    Simulates subagent attempting to self-finalize the global run
  stale-heartbeat-missed     Simulates a subagent lease expiration transitioning to stale_candidate
  polling-loop-prevented     Simulates prevention of multiple active pollers on a run
  parent-progress-reconstruct Reconstructs run progress from an events ledger file
  subagent-wrong-role-envelope Simulates rejection of a subagent with mismatched role envelope
  same-error-loop            Simulates a subagent stuck in an identical error loop
  oscillating-patch          Simulates a subagent generating A/B/A/B alternating patches
  heartbeat-only-stall       Simulates a subagent sending heartbeats but no progress
  no-evidence-progress       Simulates a subagent reporting progress without actionable evidence
  quality-happy-path         Simulates passing all quality gates
  quality-mechanical-fail    Simulates a mechanical gate failure (no tests run)
  quality-semantic-insufficient-evidence Simulates a semantic gate failure (empty goal or evidence mismatch)
  quality-consensus-required Simulates high risk condition requiring consensus
  quality-stagnation-unresolved Simulates semantic failure due to unresolved stagnation
  hitl-scenario              Simulates a Human-in-the-Loop intervention requirement
  rewind-preview             Preview the result of a rewind operation
  rewind-create-branch       Simulates an append-only branch creation
  rewind-destructive-requires-flag Simulates requiring the destructive flag
  rewind-invalid-event-id    Simulates rewinding to a non-existent event
  rewind-preserves-original-ledger Simulates preserving original ledger
  consensus-happy-path       Simulates all personas approving
  consensus-devil-rejects    Simulates Devil's Advocate rejecting
  consensus-regression-risk  Simulates Regression Reviewer requiring rework
  consensus-security-state-risk Simulates Security-State Reviewer rejecting
  consensus-inconclusive     Simulates inconclusive consensus results
  consensus-self-finalizes-rejected Simulates consensus attempting to self-finalize
  consensus-dispatcher-runtime Simulates dispatcher appending events for consensus
  consensus-dispatch-invalid-envelope Simulates rejection of invalid envelope properties
  consensus-dispatch-antigravity-inherits-model Simulates consensus inheriting model without switching
  consensus-live-invocation          Simulates real consensus multi-persona invocation loop
Options:
  --scenario <scenario>      Select the simulation scenario (default: happy-path)
  --json                     Output details in machine-readable JSON format
  --write-checkpoint         Actually write a dry-run checkpoint to .lazycodex/checkpoints/
  --persist-checkpoint       Alias for --write-checkpoint`;
