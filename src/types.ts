/**
 * Core types for BozoLoop.
 *
 * These interfaces define the contract for loop execution:
 * suggest → apply → evaluate → record → repeat.
 */

// ---------------------------------------------------------------------------
// Status & Results
// ---------------------------------------------------------------------------

/** Possible states a loop can be in. */
export type LoopStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "aborted";

/** Result of a single evaluator run. */
export interface EvalResult {
  /** Name of the evaluator that produced this result. */
  name: string;
  /** Whether the evaluation passed. */
  pass: boolean;
  /** Human-readable detail or error message. */
  message?: string;
  /** How long the evaluation took in milliseconds. */
  durationMs?: number;
}

/** Result of applying a patch. */
export interface ApplyResult {
  /** Whether the patch was applied successfully. */
  ok: boolean;
  /** Descriptive message about what happened. */
  message?: string;
}

/** A proposed change from the suggestion engine. */
export interface Suggestion {
  /** Short human-readable summary of what this change does. */
  summary: string;
  /** The patch payload — shape is up to the engine/applier pair. */
  patch: unknown;
}

/** One recorded attempt in the loop. */
export interface AttemptRecord {
  /** 1-indexed attempt number. */
  attempt: number;
  /** ISO-8601 timestamp when the attempt started. */
  timestamp: string;
  /** Summary from the suggestion engine. */
  patchSummary: string;
  /** Result of applying the patch. */
  applyResult: ApplyResult;
  /** Results from each evaluator. */
  evalResults: EvalResult[];
  /** Whether all evaluators passed. */
  pass: boolean;
  /** Optional note or error string. */
  note?: string;
  /** Total duration of this attempt in milliseconds. */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

/** Persisted ledger of all attempts. */
export interface LoopLedger {
  /** Goal / spec that the loop is working toward. */
  goal: string;
  /** Workspace root path. */
  workspace: string;
  /** When the loop was first created (ISO-8601). */
  createdAt: string;
  /** When the ledger was last updated (ISO-8601). */
  updatedAt: string;
  /** Ordered list of attempt records. */
  attempts: AttemptRecord[];
}

// ---------------------------------------------------------------------------
// Loop State (for pause / resume)
// ---------------------------------------------------------------------------

/** Persisted state used for pause / resume semantics. */
export interface LoopState {
  status: LoopStatus;
  /** Current attempt counter value. */
  currentAttempt: number;
  /** Maximum attempts allowed. */
  maxAttempts: number;
  /** ISO-8601 timestamp of last status change. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Extension Points
// ---------------------------------------------------------------------------

/**
 * A suggestion engine proposes changes given the current context.
 *
 * You bring your own implementation — call an LLM, run a script,
 * read a diff from disk, whatever you want.
 */
export interface SuggestionEngine {
  suggest(context: SuggestionContext): Promise<Suggestion>;
}

/** Context passed to the suggestion engine on each attempt. */
export interface SuggestionContext {
  goal: string;
  workspace: string;
  attempt: number;
  previousAttempts: AttemptRecord[];
}

/**
 * Applies a suggested patch to the workspace.
 *
 * Could write files, run a formatter, apply a git patch, etc.
 */
export interface PatchApplier {
  apply(patch: unknown, workspace: string): Promise<ApplyResult>;
}

/**
 * Evaluates the workspace after a patch has been applied.
 *
 * Return pass/fail plus optional diagnostics.
 */
export interface Evaluator {
  /** Human-readable name for this evaluator. */
  name: string;
  evaluate(workspace: string): Promise<EvalResult>;
}

/**
 * Creates and restores workspace checkpoints.
 *
 * v0.0.1 ships with a simple file-copy provider.
 * A git-based provider is planned for a future release.
 */
export interface CheckpointProvider {
  create(workspace: string, label: string): Promise<string>;
  restore(workspace: string, checkpointId: string): Promise<void>;
  list(workspace: string): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Lifecycle hooks fired during loop execution. */
export interface BozoLoopHooks {
  onLoopStart?: (config: BozoLoopConfig) => void | Promise<void>;
  onLoopEnd?: (result: LoopRunResult) => void | Promise<void>;
  onAttemptStart?: (attempt: number) => void | Promise<void>;
  onAttemptEnd?: (record: AttemptRecord) => void | Promise<void>;
  onSuggestion?: (suggestion: Suggestion) => void | Promise<void>;
  onApply?: (result: ApplyResult) => void | Promise<void>;
  onEval?: (result: EvalResult) => void | Promise<void>;
  onPause?: () => void | Promise<void>;
  onResume?: () => void | Promise<void>;
  onAbort?: () => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Runtime target hint (informational for v0.0.1). */
export type RuntimeTarget = "local" | "worker" | "cloud";

/**
 * Full configuration for a BozoLoop run.
 *
 * Use `defineConfig()` for type-safe config files.
 */
export interface BozoLoopConfig {
  /** Short description of the goal. */
  goal: string;
  /** Longer specification / requirements (optional). */
  spec?: string;
  /** Absolute or relative path to the workspace root. */
  workspace: string;
  /** Maximum number of attempts before stopping. Default: 10. */
  maxAttempts?: number;
  /** The engine that proposes changes. */
  engine: SuggestionEngine;
  /** Applies proposed patches to the workspace. */
  applier: PatchApplier;
  /** One or more evaluators. All must pass for an attempt to succeed. */
  evaluators: Evaluator[];
  /** Lifecycle hooks. */
  hooks?: BozoLoopHooks;
  /** Checkpoint provider for rollback support. */
  checkpoint?: CheckpointProvider;
  /** Runtime target hint. Only "local" is functional in v0.0.1. */
  runtime?: RuntimeTarget;
  /** Custom stop condition evaluated after each attempt. */
  stopWhen?: (record: AttemptRecord, allRecords: AttemptRecord[]) => boolean;
  /** Directory for BozoLoop state/ledger. Default: ".bozoloop" */
  stateDir?: string;
}

// ---------------------------------------------------------------------------
// Run Result
// ---------------------------------------------------------------------------

/** Final result returned after a loop completes. */
export interface LoopRunResult {
  /** Did the loop end with a passing attempt? */
  success: boolean;
  /** Total number of attempts executed. */
  totalAttempts: number;
  /** Final status of the loop. */
  status: LoopStatus;
  /** All attempt records in order. */
  attempts: AttemptRecord[];
  /** Duration of the entire run in milliseconds. */
  durationMs: number;
}
