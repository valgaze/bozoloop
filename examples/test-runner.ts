/**
 * Example: Using commandEvaluator to run tests.
 *
 * This shows how to use BozoLoop with real shell commands
 * as evaluators — the most common pattern for test-driven loops.
 *
 * Run with: npx tsx examples/test-runner.ts
 */

import {
  createLoop,
  commandEvaluator,
  FileCheckpointProvider,
  type SuggestionEngine,
  type PatchApplier,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Your engine and applier would go here.
// For this example, we use simple stubs.
// ---------------------------------------------------------------------------

const engine: SuggestionEngine = {
  async suggest(ctx) {
    return {
      summary: `Iteration ${ctx.attempt}: attempting fix based on ${ctx.previousAttempts.length} prior attempts`,
      patch: { iteration: ctx.attempt },
    };
  },
};

const applier: PatchApplier = {
  async apply(_patch, _workspace) {
    return { ok: true, message: "Applied." };
  },
};

// ---------------------------------------------------------------------------
// Run with real command evaluators
// ---------------------------------------------------------------------------

async function main() {
  const loop = createLoop({
    goal: "All tests and type checks pass",
    workspace: ".",
    maxAttempts: 5,
    engine,
    applier,
    evaluators: [
      // Runs `npm test` and passes if exit code is 0
      commandEvaluator("tests", "npm test"),
      // Runs type checking
      commandEvaluator("typecheck", "npx tsc --noEmit"),
    ],
    checkpoint: new FileCheckpointProvider(".bozoloop"),
    hooks: {
      onAttemptEnd: (record) => {
        console.log(`Attempt ${record.attempt}: ${record.pass ? "✅" : "❌"}`);
        for (const er of record.evalResults) {
          console.log(`  ${er.pass ? "✅" : "❌"} ${er.name}`);
        }
      },
    },
  });

  const result = await loop.run();
  console.log(`\nDone: ${result.success ? "SUCCESS" : "FAILED"}`);
}

main().catch(console.error);
