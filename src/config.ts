import type { BozoLoopConfig } from "./types.js";

/**
 * Type-safe config helper for `bozoloop.config.ts` files.
 *
 * ```ts
 * // bozoloop.config.ts
 * import { defineConfig } from "bozoloop";
 *
 * export default defineConfig({
 *   goal: "Make all tests pass",
 *   workspace: ".",
 *   engine: myEngine,
 *   applier: myApplier,
 *   evaluators: [myEval],
 * });
 * ```
 */
export function defineConfig(config: BozoLoopConfig): BozoLoopConfig {
  return config;
}
