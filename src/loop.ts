import * as fs from "node:fs";
import * as path from "node:path";
import type {
  BozoLoopConfig,
  BozoLoopHooks,
  AttemptRecord,
  LoopRunResult,
  CheckpointProvider,
} from "./types.js";
import { Ledger } from "./ledger.js";
import { State } from "./state.js";
import { NoopCheckpointProvider } from "./checkpoints.js";

/**
 * The core BozoLoop runner.
 *
 * ```ts
 * const loop = createLoop(config);
 * const result = await loop.run();
 * ```
 */
export class BozoLoop {
  private config: Required<
    Pick<BozoLoopConfig, "goal" | "workspace" | "maxAttempts" | "engine" | "applier" | "evaluators">
  > &
    BozoLoopConfig;
  private stateDir: string;
  private ledger: Ledger;
  private state: State;
  private hooks: BozoLoopHooks;
  private checkpoint: CheckpointProvider;

  constructor(config: BozoLoopConfig) {
    const workspace = path.resolve(config.workspace);
    this.config = {
      ...config,
      workspace,
      maxAttempts: config.maxAttempts ?? 10,
    };
    this.stateDir = path.resolve(workspace, config.stateDir ?? ".bozoloop");
    this.hooks = config.hooks ?? {};
    this.checkpoint = config.checkpoint ?? new NoopCheckpointProvider();

    // Ensure state directory exists
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }

    this.ledger = new Ledger(this.stateDir, this.config.goal, workspace);
    this.state = new State(this.stateDir, this.config.maxAttempts);
  }

  /**
   * Run the loop from the beginning (or from where it left off if resuming).
   */
  async run(): Promise<LoopRunResult> {
    const startTime = Date.now();
    this.state.setStatus("running");
    await this.hooks.onLoopStart?.(this.config);

    const maxAttempts = this.config.maxAttempts;
    let lastRecord: AttemptRecord | undefined;

    while (this.state.currentAttempt < maxAttempts) {
      // Check for external pause/abort signals
      if (this.state.shouldStop()) {
        await this.hooks.onPause?.();
        break;
      }

      const attemptNum = this.state.incrementAttempt();
      await this.hooks.onAttemptStart?.(attemptNum);

      const record = await this.executeAttempt(attemptNum);
      lastRecord = record;

      this.ledger.record(record);
      await this.hooks.onAttemptEnd?.(record);

      if (record.pass) {
        this.state.setStatus("completed");
        const result = this.buildResult(startTime);
        await this.hooks.onLoopEnd?.(result);
        return result;
      }

      // Check custom stop condition
      if (this.config.stopWhen?.(record, this.ledger.getAttempts())) {
        this.state.setStatus("completed");
        const result = this.buildResult(startTime);
        await this.hooks.onLoopEnd?.(result);
        return result;
      }
    }

    // Exhausted attempts or was paused/aborted
    if (this.state.status === "running") {
      this.state.setStatus("failed");
    }
    const result = this.buildResult(startTime);
    await this.hooks.onLoopEnd?.(result);
    return result;
  }

  /**
   * Resume a previously paused loop.
   */
  async resume(): Promise<LoopRunResult> {
    if (this.state.status !== "paused") {
      throw new Error(
        `Cannot resume: loop is "${this.state.status}", not "paused".`
      );
    }
    this.state.setStatus("running");
    await this.hooks.onResume?.();
    return this.run();
  }

  /**
   * Pause the loop. Takes effect between attempts.
   */
  pause(): void {
    this.state.setStatus("paused");
  }

  /**
   * Abort the loop immediately. Takes effect between attempts.
   */
  abort(): void {
    this.state.setStatus("aborted");
  }

  /**
   * Rollback to the most recent checkpoint (if checkpointing is enabled).
   */
  async rollback(): Promise<void> {
    const checkpoints = await this.checkpoint.list(this.config.workspace);
    if (checkpoints.length === 0) {
      throw new Error("No checkpoints available for rollback.");
    }
    const latest = checkpoints[checkpoints.length - 1]!;
    await this.checkpoint.restore(this.config.workspace, latest);
  }

  /**
   * Get current loop state and ledger data for inspection.
   */
  inspect() {
    return {
      state: this.state.getData(),
      ledger: this.ledger.getData(),
    };
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async executeAttempt(attemptNum: number): Promise<AttemptRecord> {
    const attemptStart = Date.now();

    try {
      // 1. Create checkpoint before changes
      await this.checkpoint.create(
        this.config.workspace,
        `attempt-${attemptNum}`
      );

      // 2. Get suggestion
      const suggestion = await this.config.engine.suggest({
        goal: this.config.goal,
        workspace: this.config.workspace,
        attempt: attemptNum,
        previousAttempts: this.ledger.getAttempts(),
      });
      await this.hooks.onSuggestion?.(suggestion);

      // 3. Apply patch
      const applyResult = await this.config.applier.apply(
        suggestion.patch,
        this.config.workspace
      );
      await this.hooks.onApply?.(applyResult);

      if (!applyResult.ok) {
        return {
          attempt: attemptNum,
          timestamp: new Date().toISOString(),
          patchSummary: suggestion.summary,
          applyResult,
          evalResults: [],
          pass: false,
          note: "Patch failed to apply.",
          durationMs: Date.now() - attemptStart,
        };
      }

      // 4. Run evaluators
      const evalResults = [];
      for (const evaluator of this.config.evaluators) {
        const result = await evaluator.evaluate(this.config.workspace);
        await this.hooks.onEval?.(result);
        evalResults.push(result);
      }

      const allPassed = evalResults.every((r) => r.pass);

      return {
        attempt: attemptNum,
        timestamp: new Date().toISOString(),
        patchSummary: suggestion.summary,
        applyResult,
        evalResults,
        pass: allPassed,
        durationMs: Date.now() - attemptStart,
      };
    } catch (err: unknown) {
      return {
        attempt: attemptNum,
        timestamp: new Date().toISOString(),
        patchSummary: "(error before suggestion)",
        applyResult: { ok: false, message: "Attempt threw an error." },
        evalResults: [],
        pass: false,
        note: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - attemptStart,
      };
    }
  }

  private buildResult(startTime: number): LoopRunResult {
    const attempts = this.ledger.getAttempts();
    return {
      success: attempts.some((a) => a.pass),
      totalAttempts: attempts.length,
      status: this.state.status,
      attempts,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Create a new BozoLoop instance.
 *
 * ```ts
 * import { createLoop } from "bozoloop";
 *
 * const loop = createLoop({
 *   goal: "All tests pass",
 *   workspace: ".",
 *   engine: myEngine,
 *   applier: myApplier,
 *   evaluators: [testEval],
 * });
 *
 * const result = await loop.run();
 * ```
 */
export function createLoop(config: BozoLoopConfig): BozoLoop {
  return new BozoLoop(config);
}
