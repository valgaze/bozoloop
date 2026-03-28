/**
 * Example bozoloop.config.ts
 *
 * Place this in your project root and run `bozoloop run`.
 * Customize the engine, applier, and evaluators for your workflow.
 */

import { defineConfig, commandEvaluator } from "bozoloop";
import type { SuggestionEngine, PatchApplier } from "bozoloop";

// Replace with your actual suggestion engine
// (e.g., call an LLM API, run a codemod, apply a template)
const engine: SuggestionEngine = {
  name: "my-engine",
  async suggest(ctx) {
    // Use ctx.previousAttempts to learn from past failures
    const lastFailure = ctx.previousAttempts[0];
    const hint = lastFailure?.evalResults
      .filter((r) => !r.pass)
      .map((r) => r.message)
      .join("; ");

    return {
      summary: `Attempt ${ctx.attempt}: fix based on ${hint ?? "initial spec"}`,
      patch: {
        // Your patch payload — whatever your applier expects
        files: [{ path: "src/main.ts", content: "// fixed code" }],
      },
    };
  },
};

// Replace with your actual patch applier
const applier: PatchApplier = {
  name: "my-applier",
  async apply(suggestion, _ctx) {
    // Write files, run codemods, apply diffs, etc.
    console.log(`Applying: ${suggestion.summary}`);
    return { success: true };
  },
};

export default defineConfig({
  goal: "Make all tests pass and achieve type safety",
  spec: `
    1. All unit tests should pass
    2. No TypeScript errors
    3. Linting should be clean
  `,
  workspace: ".",
  maxAttempts: 10,
  engine,
  applier,
  evaluators: [
    commandEvaluator("tests", "npm test"),
    commandEvaluator("types", "npx tsc --noEmit"),
  ],
  hooks: {
    onAttemptStart(ctx) {
      console.log(`\n🔄 Attempt ${ctx.attempt}/${10}`);
    },
    onRunEnd(result) {
      console.log(`\n🏁 ${result.status} — ${result.passedAttempts} passed, ${result.failedAttempts} failed`);
    },
  },
});
