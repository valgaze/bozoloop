/**
 * BozoLoop — Self-improving code loops. Zero dependencies.
 *
 * Spec. Patch. Eval. Repeat. 🤡
 *
 * @packageDocumentation
 */

// Core loop
export { BozoLoop, createLoop } from "./loop.ts";

// Configuration
export { defineConfig } from "./config.ts";

// Built-in evaluators
export { commandEvaluator, predicateEvaluator } from "./evaluators.ts";

// Checkpoint providers
export {
  createLocalCheckpointProvider,
  createNoopCheckpointProvider,
  removeCheckpoint,
} from "./checkpoints.ts";

// Ledger & state (for advanced / programmatic use)
export {
  readLedger,
  writeLedger,
  createLedger,
} from "./ledger.ts";
export {
  readState,
  writeState,
  createState,
} from "./state.ts";

// Types
export type {
  BozoLoopConfig,
  LoopRunResult,
  LoopStatus,
  AttemptRecord,
  EvalResult,
  LoopLedger,
  LoopState,
  LoopContext,
  Suggestion,
  SuggestionEngine,
  PatchApplier,
  Evaluator,
  CheckpointProvider,
  BozoLoopHooks,
  StopCondition,
  RuntimeTarget,
} from "./types.ts";
