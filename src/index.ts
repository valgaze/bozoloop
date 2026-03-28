/**
 * bozoloop — self-improving code loops
 *
 * Zero-dependency TypeScript library for iterative
 * spec → patch → eval → repeat workflows.
 *
 * @packageDocumentation
 */

// Core loop
export { BozoLoop, createLoop } from "./loop.js";

// Config helper
export { defineConfig } from "./config.js";

// Evaluators
export { commandEvaluator } from "./evaluators.js";

// Checkpoint providers
export { FileCheckpointProvider, NoopCheckpointProvider } from "./checkpoints.js";

// All types
export type {
  BozoLoopConfig,
  BozoLoopHooks,
  LoopRunResult,
  LoopStatus,
  AttemptRecord,
  LoopLedger,
  LoopState,
  SuggestionEngine,
  SuggestionContext,
  Suggestion,
  PatchApplier,
  ApplyResult,
  Evaluator,
  EvalResult,
  CheckpointProvider,
  RuntimeTarget,
} from "./types.js";
