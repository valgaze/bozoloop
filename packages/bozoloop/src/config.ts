/**
 * Configuration helpers.
 *
 * `defineConfig` provides a typed identity function so config files
 * get full IntelliSense without importing the config type manually.
 */

import type { BozoLoopConfig } from "./types.ts";

/**
 * Define a BozoLoop configuration with full type safety.
 *
 * @example
 * ```ts
 * // bozoloop.config.ts
 * import { defineConfig } from "bozoloop";
 *
 * export default defineConfig({
 *   goal: "Make all tests pass",
 *   engine: myEngine,
 *   applier: myApplier,
 *   evaluators: [myEval],
 * });
 * ```
 */
export function defineConfig(config: BozoLoopConfig): BozoLoopConfig {
  return config;
}
