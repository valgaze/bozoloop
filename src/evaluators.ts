import { execSync } from "node:child_process";
import type { Evaluator, EvalResult } from "./types.js";

/**
 * Create an evaluator that runs a shell command and passes if exit code is 0.
 *
 * This is the simplest and most useful evaluator for most workflows:
 * run your test suite, linter, type-checker, or any CLI tool.
 *
 * ```ts
 * import { commandEvaluator } from "bozoloop";
 *
 * const tests = commandEvaluator("tests", "npm test");
 * const types = commandEvaluator("typecheck", "npx tsc --noEmit");
 * ```
 */
export function commandEvaluator(name: string, command: string): Evaluator {
  return {
    name,
    async evaluate(workspace: string): Promise<EvalResult> {
      const start = Date.now();
      try {
        const output = execSync(command, {
          cwd: workspace,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 300_000, // 5 minute timeout
        });
        return {
          name,
          pass: true,
          message: output.slice(-500), // last 500 chars of output
          durationMs: Date.now() - start,
        };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message.slice(-500) : String(err);
        return {
          name,
          pass: false,
          message,
          durationMs: Date.now() - start,
        };
      }
    },
  };
}
