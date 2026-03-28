/**
 * Built-in evaluators.
 *
 * BozoLoop ships with a handful of useful evaluator factories.
 * Users can (and should) write their own — these are just conveniences.
 */

import { execSync } from "node:child_process";
import type { Evaluator, EvalResult, LoopContext } from "./types.ts";

/**
 * Creates an evaluator that runs a shell command and passes if exit code is 0.
 *
 * @example
 * ```ts
 * const testEval = commandEvaluator("tests", "npm test");
 * ```
 */
export function commandEvaluator(
  name: string,
  command: string,
  options?: { timeout?: number },
): Evaluator {
  return {
    name,
    async evaluate(ctx: LoopContext): Promise<EvalResult> {
      try {
        const output = execSync(command, {
          cwd: ctx.workspace,
          timeout: options?.timeout ?? 60_000,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        return {
          name,
          pass: true,
          message: output.trim().slice(-500) || "Command succeeded",
        };
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; message?: string };
        const detail =
          error.stderr?.trim().slice(-500) ||
          error.stdout?.trim().slice(-500) ||
          error.message ||
          "Command failed";
        return {
          name,
          pass: false,
          message: detail,
        };
      }
    },
  };
}

/**
 * Creates an evaluator from a simple predicate function.
 *
 * @example
 * ```ts
 * const exists = predicateEvaluator("file-exists", async (ctx) => {
 *   return fs.existsSync(path.join(ctx.workspace, "output.json"));
 * });
 * ```
 */
export function predicateEvaluator(
  name: string,
  predicate: (ctx: LoopContext) => boolean | Promise<boolean>,
  options?: { message?: string },
): Evaluator {
  return {
    name,
    async evaluate(ctx: LoopContext): Promise<EvalResult> {
      try {
        const pass = await predicate(ctx);
        return {
          name,
          pass,
          message: pass
            ? options?.message ?? "Predicate passed"
            : options?.message ?? "Predicate failed",
        };
      } catch (err: unknown) {
        return {
          name,
          pass: false,
          message: (err as Error).message ?? "Predicate threw",
        };
      }
    },
  };
}
