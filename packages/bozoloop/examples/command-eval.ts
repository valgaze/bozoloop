/**
 * Command evaluator example
 *
 * Shows how to use commandEvaluator to run `npm test` (or any shell
 * command) as the evaluation step in a BozoLoop.
 *
 * Run: npx tsx examples/command-eval.ts
 */

import {
  createLoop,
  commandEvaluator,
  type SuggestionEngine,
  type PatchApplier,
} from "../src/index.ts";

// Your actual suggestion engine would call an LLM, run a codemod, etc.
const engine: SuggestionEngine = {
  name: "placeholder-engine",
  async suggest(ctx) {
    return {
      summary: `Fix attempt ${ctx.attempt} based on previous failures`,
      patch: { attempt: ctx.attempt },
    };
  },
};

// Your actual applier would write files, apply git diffs, etc.
const applier: PatchApplier = {
  name: "placeholder-applier",
  async apply(suggestion, _ctx) {
    console.log(`  📝 Would apply: ${suggestion.summary}`);
    return { success: true };
  },
};

async function main() {
  const loop = createLoop({
    goal: "Make all tests pass",
    workspace: ".",
    maxAttempts: 5,
    engine,
    applier,
    evaluators: [
      // Run your test suite as the evaluator
      commandEvaluator("npm-test", "npm test", { timeout: 30_000 }),

      // You can also run type checking
      // commandEvaluator("typecheck", "npx tsc --noEmit"),

      // Or linting
      // commandEvaluator("lint", "npm run lint"),
    ],
    hooks: {
      onAttemptStart(ctx) {
        console.log(`\n🔄 Attempt ${ctx.attempt}`);
      },
      onEvalComplete(results) {
        for (const r of results) {
          const icon = r.pass ? "✅" : "❌";
          console.log(`  ${icon} ${r.name}: ${r.message?.slice(0, 100) ?? ""}`);
        }
      },
      onRunEnd(result) {
        console.log(`\n🏁 ${result.status} after ${result.totalAttempts} attempts`);
      },
    },
  });

  const result = await loop.run();
  console.log("\nLedger written to .bozoloop/ledger.json");
  console.log(`Final status: ${result.status}`);
}

main().catch(console.error);
