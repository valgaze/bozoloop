/**
 * Example bozoloop.config.ts
 *
 * This file shows the shape of a config file.
 * In practice, you'd import your real engine and applier implementations.
 *
 * Usage:
 *   npx bozoloop run --config bozoloop.config.js
 *   (compile this .ts to .js first, or use tsx)
 */

import { defineConfig, commandEvaluator } from "bozoloop";
import type { SuggestionEngine, PatchApplier } from "bozoloop";

// Bring your own suggestion engine
const engine: SuggestionEngine = {
  async suggest(ctx) {
    // Call your LLM, read files, generate diffs, etc.
    return {
      summary: `Fix attempt #${ctx.attempt}`,
      patch: { /* your patch data */ },
    };
  },
};

// Bring your own patch applier
const applier: PatchApplier = {
  async apply(patch, workspace) {
    // Write files, apply diffs, run formatters, etc.
    return { ok: true, message: "Applied." };
  },
};

export default defineConfig({
  goal: "All tests pass and code is clean",
  workspace: ".",
  maxAttempts: 10,
  engine,
  applier,
  evaluators: [
    commandEvaluator("tests", "npm test"),
    commandEvaluator("lint", "npm run lint"),
    commandEvaluator("typecheck", "npx tsc --noEmit"),
  ],
  hooks: {
    onAttemptEnd: (record) => {
      console.log(`#${record.attempt} ${record.pass ? "✅" : "❌"} (${record.durationMs}ms)`);
    },
  },
  stopWhen: (record, all) => {
    // Stop if we've had 3 consecutive failures with the same error
    if (all.length < 3) return false;
    const last3 = all.slice(-3);
    return last3.every((a) => !a.pass);
  },
});
