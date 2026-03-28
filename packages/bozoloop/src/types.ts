/**
 * Core types for BozoLoop.
 *
 * These interfaces define the contract between the loop engine and
 * user-provided components. Keep them dead simple — composability
 * beats abstraction every time.
 */

// ---------------------------------------------------------------------------
// Status & results
// ---------------------------------------------------------------------------

/** Current status of a loop run. */
export type LoopStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "aborted";

/** Outcome of a single evaluator run. */
export interface EvalResult {
  /** Name of the evaluator that produced this result. */
  name: string;
  /** Did the evaluation pass? */
  pass: boolean;
  /** Human-readable detail / reason. */
  message?: string;
  /** Arbitrary structured data from the evaluator. */
  meta?: Record<string, unknown>;
}

/** Record of a single loop attempt. */
export interface AttemptRecord {
  /** 1-indexed attempt number. */
  attempt: number;
  /** ISO-8601 timestamp when the attempt started. */
  timestamp: string;
  /** Short summary of the proposed change. */
  patchSummary: string;
  /** Did the patch apply cleanly? */
  applySuccess: boolean;
  /** Results from each evaluator. */
  evalResults: EvalResult[];
  /** Did all evaluators pass? */
  pass: boolean;
  /** If something went wrong, a note/error message. */
  error?: string;
  /** Duration of this attempt in milliseconds. */
  durationMs?: number;
}

/** Persisted ledger — the full history of a loop run. */
export interface LoopLedger {
  /** Unique run ID. */
  runId: string;
  /** The goal/spec for this run. */
  goal: string;
  /** Workspace path the loop operated on. */
  workspace: string;
  /** When the run started. */
  startedAt: string;
  /** When the run ended (if it has). */
  endedAt?: string;
  /** All attempt records. */
  attempts: AttemptRecord[];
  /** Final status. */
  status: LoopStatus;
  /** Maximum attempts configured. */
  maxAttempts: number;
}

/** Persisted state — enough to resume a paused/interrupted run. */
export interface LoopState {
  runId: string;
  status: LoopStatus;
  currentAttempt: number;
  maxAttempts: number;
  goal: string;
  workspace: string;
  lastUpdated: string;
  /** ID of the latest checkpoint, if any. */
  checkpointId?: string;
}

/** Summary returned when a loop run finishes (or is interrupted). */
export interface LoopRunResult {
  runId: string;
  status: LoopStatus;
  totalAttempts: number;
  passedAttempts: number;
  failedAttempts: number;
  ledger: LoopLedger;
}

// ---------------------------------------------------------------------------
// User-provided components
// ---------------------------------------------------------------------------

/** Context handed to the suggestion engine and evaluators each iteration. */
export interface LoopContext {
  /** The goal / spec the loop is working toward. */
  goal: string;
  /** Absolute path to the workspace root. */
  workspace: string;
  /** Current 1-indexed attempt number. */
  attempt: number;
  /** History of previous attempts (most recent first). */
  previousAttempts: AttemptRecord[];
}

/** A proposed change from the suggestion engine. */
export interface Suggestion {
  /** Short human-readable summary of what changed. */
  summary: string;
  /** Arbitrary payload the PatchApplier knows how to consume. */
  patch: unknown;
}

/**
 * Proposes a change given the current loop context.
 *
 * This is where your LLM call, codegen script, or manual patch logic lives.
 */
export interface SuggestionEngine {
  name?: string;
  suggest(ctx: LoopContext): Promise<Suggestion>;
}

/**
 * Applies a proposed patch to the workspace.
 *
 * Could write files, run a codemod, apply a git diff — whatever you need.
 */
export interface PatchApplier {
  name?: string;
  apply(suggestion: Suggestion, ctx: LoopContext): Promise<{ success: boolean; error?: string }>;
}

/**
 * Evaluates the workspace after a patch has been applied.
 *
 * Return `pass: true` if the workspace meets the evaluator's criteria.
 */
export interface Evaluator {
  name: string;
  evaluate(ctx: LoopContext): Promise<EvalResult>;
}

/**
 * Creates and restores workspace checkpoints.
 *
 * The default implementation copies touched files to `.bozoloop/checkpoints/`.
 * You can swap in a git-stash provider, a container snapshot, etc.
 */
export interface CheckpointProvider {
  name?: string;
  /** Create a checkpoint and return an opaque ID. */
  create(ctx: LoopContext): Promise<string>;
  /** Restore the workspace to a previous checkpoint. */
  restore(checkpointId: string, ctx: LoopContext): Promise<void>;
  /** List available checkpoint IDs. */
  list(ctx: LoopContext): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Lifecycle hooks fired around the loop.
 *
 * All hooks are optional. They receive the relevant context and can be
 * used for logging, Slack notifications, deploy previews, telemetry, etc.
 */
export interface BozoLoopHooks {
  onRunStart?(ctx: LoopContext): void | Promise<void>;
  onRunEnd?(result: LoopRunResult): void | Promise<void>;
  onAttemptStart?(ctx: LoopContext): void | Promise<void>;
  onAttemptEnd?(record: AttemptRecord, ctx: LoopContext): void | Promise<void>;
  onSuggestion?(suggestion: Suggestion, ctx: LoopContext): void | Promise<void>;
  onPatchApplied?(suggestion: Suggestion, ctx: LoopContext): void | Promise<void>;
  onEvalComplete?(results: EvalResult[], ctx: LoopContext): void | Promise<void>;
  onPause?(ctx: LoopContext): void | Promise<void>;
  onResume?(ctx: LoopContext): void | Promise<void>;
  onAbort?(ctx: LoopContext): void | Promise<void>;
  onError?(error: Error, ctx: LoopContext): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Stop-condition callback. Return `true` to end the loop early. */
export type StopCondition = (ctx: LoopContext, lastResult: EvalResult[]) => boolean | Promise<boolean>;

/** Runtime hint (no effect in v0.0.1 — reserved for future cloud/worker support). */
export type RuntimeTarget = "local" | "worker" | "cloud";

/** Full configuration for a BozoLoop run. */
export interface BozoLoopConfig {
  /** Human-readable goal or spec for this loop. */
  goal: string;
  /** Optional longer spec / prompt. Falls back to `goal` if omitted. */
  spec?: string;
  /** Absolute or relative path to the workspace root. Defaults to `"."`. */
  workspace?: string;
  /** Maximum number of loop iterations. Default: `10`. */
  maxAttempts?: number;

  /** How changes are proposed. */
  engine: SuggestionEngine;
  /** How proposed changes are applied to the workspace. */
  applier: PatchApplier;
  /** One or more evaluators that judge the result. */
  evaluators: Evaluator[];

  /** Lifecycle hooks. */
  hooks?: BozoLoopHooks;
  /** Checkpoint provider for rollback support. */
  checkpointing?: CheckpointProvider;
  /** Custom stop condition (checked after evaluators). */
  stopWhen?: StopCondition;
  /** Runtime hint for future environments. Default: `"local"`. */
  runtime?: RuntimeTarget;
}
