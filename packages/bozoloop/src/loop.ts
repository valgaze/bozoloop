/**
 * BozoLoop — the core loop engine.
 *
 * Mental model: spec → propose → apply → eval → record → repeat
 *
 * This is the beating heart of the library. It orchestrates the
 * suggestion engine, patch applier, evaluators, checkpointing,
 * ledgering, and lifecycle hooks into a single resumable loop.
 */

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type {
  BozoLoopConfig,
  LoopContext,
  LoopRunResult,
  LoopStatus,
  AttemptRecord,
  CheckpointProvider,
  BozoLoopHooks,
  LoopLedger,
  LoopState,
} from "./types.ts";
import {
  createLedger,
  writeLedger,
  readLedger,
  appendAttempt,
  updateLedgerStatus,
} from "./ledger.ts";
import {
  createState,
  writeState,
  readState,
  updateStateStatus,
} from "./state.ts";
import { createNoopCheckpointProvider } from "./checkpoints.ts";

/**
 * Create a new BozoLoop instance from config.
 *
 * @example
 * ```ts
 * const loop = createLoop({
 *   goal: "All tests pass",
 *   engine: myEngine,
 *   applier: myApplier,
 *   evaluators: [commandEvaluator("tests", "npm test")],
 * });
 *
 * const result = await loop.run();
 * console.log(result.status); // "completed" | "failed"
 * ```
 */
export function createLoop(config: BozoLoopConfig): BozoLoop {
  return new BozoLoop(config);
}

export class BozoLoop {
  private config: Required<
    Pick<BozoLoopConfig, "goal" | "workspace" | "maxAttempts" | "engine" | "applier" | "evaluators" | "runtime">
  > & {
    spec: string;
    hooks: BozoLoopHooks;
    checkpointing: CheckpointProvider;
    stopWhen?: BozoLoopConfig["stopWhen"];
  };

  private ledger: LoopLedger | null = null;
  private state: LoopState | null = null;
  private _status: LoopStatus = "idle";

  constructor(config: BozoLoopConfig) {
    this.config = {
      goal: config.goal,
      spec: config.spec ?? config.goal,
      workspace: resolve(config.workspace ?? "."),
      maxAttempts: config.maxAttempts ?? 10,
      engine: config.engine,
      applier: config.applier,
      evaluators: config.evaluators,
      hooks: config.hooks ?? {},
      checkpointing: config.checkpointing ?? createNoopCheckpointProvider(),
      stopWhen: config.stopWhen,
      runtime: config.runtime ?? "local",
    };
  }

  /** Current loop status. */
  get status(): LoopStatus {
    return this._status;
  }

  /**
   * Run the loop from the beginning.
   *
   * Creates a fresh run ID, initializes ledger and state,
   * and iterates until success, max attempts, or interruption.
   */
  async run(): Promise<LoopRunResult> {
    const runId = randomUUID();
    const { goal, workspace, maxAttempts } = this.config;

    this.ledger = createLedger(runId, goal, workspace, maxAttempts);
    this.state = createState(runId, goal, workspace, maxAttempts);
    this._status = "running";

    await updateLedgerStatus(workspace, this.ledger, "running");
    await updateStateStatus(workspace, this.state, "running");

    const ctx = this.makeContext(1);
    await this.config.hooks.onRunStart?.(ctx);

    return this.executeLoop(1);
  }

  /**
   * Resume a paused or interrupted loop from saved state.
   *
   * Reads state and ledger from disk and continues from the
   * last recorded attempt.
   */
  async resume(): Promise<LoopRunResult> {
    const { workspace } = this.config;

    const savedState = await readState(workspace);
    const savedLedger = await readLedger(workspace);

    if (!savedState || !savedLedger) {
      throw new Error(
        "No saved state found. Use run() to start a new loop.",
      );
    }

    if (savedState.status !== "paused" && savedState.status !== "running") {
      throw new Error(
        `Cannot resume from status "${savedState.status}". Only "paused" or "running" states can be resumed.`,
      );
    }

    this.state = savedState;
    this.ledger = savedLedger;
    this._status = "running";

    const nextAttempt = savedState.currentAttempt + 1;

    await updateLedgerStatus(workspace, this.ledger, "running");
    await updateStateStatus(workspace, this.state, "running");

    const ctx = this.makeContext(nextAttempt);
    await this.config.hooks.onResume?.(ctx);

    return this.executeLoop(nextAttempt);
  }

  /**
   * Pause the loop after the current attempt completes.
   *
   * Sets a flag that the loop checks between iterations.
   * The loop will finish the current attempt, persist state, and return.
   */
  pause(): void {
    if (this._status === "running") {
      this._status = "paused";
    }
  }

  /**
   * Abort the loop immediately after the current attempt.
   *
   * Like pause, but marks the run as aborted rather than paused.
   */
  abort(): void {
    if (this._status === "running" || this._status === "paused") {
      this._status = "aborted";
    }
  }

  /**
   * Alias for abort().
   */
  bail(): void {
    this.abort();
  }

  /**
   * Roll back to the most recent checkpoint.
   *
   * Only works if a checkpoint provider is configured and checkpoints exist.
   */
  async rollback(): Promise<void> {
    const { workspace } = this.config;
    const ctx = this.makeContext(this.state?.currentAttempt ?? 0);

    const checkpoints = await this.config.checkpointing.list(ctx);
    if (checkpoints.length === 0) {
      throw new Error("No checkpoints available for rollback.");
    }

    const latest = checkpoints[checkpoints.length - 1]!;
    await this.config.checkpointing.restore(latest, ctx);

    if (this.state) {
      this.state.checkpointId = latest;
      await writeState(workspace, this.state);
    }
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private makeContext(attempt: number): LoopContext {
    return {
      goal: this.config.goal,
      workspace: this.config.workspace,
      attempt,
      previousAttempts: this.ledger
        ? [...this.ledger.attempts].reverse()
        : [],
    };
  }

  private buildResult(): LoopRunResult {
    const ledger = this.ledger!;
    return {
      runId: ledger.runId,
      status: this._status,
      totalAttempts: ledger.attempts.length,
      passedAttempts: ledger.attempts.filter((a) => a.pass).length,
      failedAttempts: ledger.attempts.filter((a) => !a.pass).length,
      ledger,
    };
  }

  private async executeLoop(startAttempt: number): Promise<LoopRunResult> {
    const { workspace, maxAttempts, engine, applier, evaluators, hooks, checkpointing, stopWhen } =
      this.config;

    for (let attempt = startAttempt; attempt <= maxAttempts; attempt++) {
      // Check for pause/abort between iterations
      if (this._status === "paused") {
        await updateStateStatus(workspace, this.state!, "paused", {
          currentAttempt: attempt - 1,
        });
        await updateLedgerStatus(workspace, this.ledger!, "paused");
        const ctx = this.makeContext(attempt);
        await hooks.onPause?.(ctx);
        return this.buildResult();
      }

      if (this._status === "aborted") {
        await updateStateStatus(workspace, this.state!, "aborted", {
          currentAttempt: attempt - 1,
        });
        await updateLedgerStatus(workspace, this.ledger!, "aborted");
        const ctx = this.makeContext(attempt);
        await hooks.onAbort?.(ctx);
        const result = this.buildResult();
        await hooks.onRunEnd?.(result);
        return result;
      }

      const ctx = this.makeContext(attempt);
      const startTime = Date.now();

      await hooks.onAttemptStart?.(ctx);

      // Create checkpoint before changes
      let checkpointId: string | undefined;
      try {
        checkpointId = await checkpointing.create(ctx);
        if (this.state) {
          this.state.checkpointId = checkpointId;
        }
      } catch {
        // Checkpointing failure is non-fatal
      }

      const record: AttemptRecord = {
        attempt,
        timestamp: new Date().toISOString(),
        patchSummary: "",
        applySuccess: false,
        evalResults: [],
        pass: false,
      };

      try {
        // 1. Propose a change
        const suggestion = await engine.suggest(ctx);
        record.patchSummary = suggestion.summary;
        await hooks.onSuggestion?.(suggestion, ctx);

        // 2. Apply the change
        const applyResult = await applier.apply(suggestion, ctx);
        record.applySuccess = applyResult.success;
        if (!applyResult.success) {
          record.error = applyResult.error ?? "Patch apply failed";
          record.durationMs = Date.now() - startTime;
          await appendAttempt(workspace, this.ledger!, record);
          await updateStateStatus(workspace, this.state!, "running", {
            currentAttempt: attempt,
          });
          await hooks.onAttemptEnd?.(record, ctx);
          continue;
        }
        await hooks.onPatchApplied?.(suggestion, ctx);

        // 3. Run evaluators
        for (const evaluator of evaluators) {
          const evalResult = await evaluator.evaluate(ctx);
          record.evalResults.push(evalResult);
        }
        await hooks.onEvalComplete?.(record.evalResults, ctx);

        // 4. Determine pass/fail
        record.pass = record.evalResults.every((r) => r.pass);
        record.durationMs = Date.now() - startTime;

        await appendAttempt(workspace, this.ledger!, record);
        await updateStateStatus(workspace, this.state!, "running", {
          currentAttempt: attempt,
        });
        await hooks.onAttemptEnd?.(record, ctx);

        // 5. Check stop condition
        if (record.pass) {
          this._status = "completed";
          await updateLedgerStatus(workspace, this.ledger!, "completed");
          await updateStateStatus(workspace, this.state!, "completed");
          const result = this.buildResult();
          await hooks.onRunEnd?.(result);
          return result;
        }

        if (stopWhen) {
          const shouldStop = await stopWhen(ctx, record.evalResults);
          if (shouldStop) {
            this._status = "completed";
            await updateLedgerStatus(workspace, this.ledger!, "completed");
            await updateStateStatus(workspace, this.state!, "completed");
            const result = this.buildResult();
            await hooks.onRunEnd?.(result);
            return result;
          }
        }
      } catch (err: unknown) {
        record.error = (err as Error).message ?? String(err);
        record.durationMs = Date.now() - startTime;

        await appendAttempt(workspace, this.ledger!, record);
        await updateStateStatus(workspace, this.state!, "running", {
          currentAttempt: attempt,
        });

        await hooks.onError?.(err as Error, ctx);
        await hooks.onAttemptEnd?.(record, ctx);
      }
    }

    // Exhausted all attempts without passing
    this._status = "failed";
    await updateLedgerStatus(workspace, this.ledger!, "failed");
    await updateStateStatus(workspace, this.state!, "failed");
    const result = this.buildResult();
    await hooks.onRunEnd?.(result);
    return result;
  }
}
