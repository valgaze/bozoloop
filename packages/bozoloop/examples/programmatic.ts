/**
 * Programmatic usage example
 *
 * Shows how to use BozoLoop programmatically with pause/resume
 * and checkpoint/rollback support.
 *
 * Run: npx tsx examples/programmatic.ts
 */

import {
  createLoop,
  createLocalCheckpointProvider,
  predicateEvaluator,
  type SuggestionEngine,
  type PatchApplier,
} from "../src/index.ts";

const engine: SuggestionEngine = {
  name: "demo-engine",
  async suggest(ctx) {
    return {
      summary: `Iteration ${ctx.attempt}: improve code quality`,
      patch: { iteration: ctx.attempt },
    };
  },
};

const applier: PatchApplier = {
  name: "demo-applier",
  async apply() {
    return { success: true };
  },
};

async function main() {
  const loop = createLoop({
    goal: "Achieve 100% test coverage",
    workspace: ".",
    maxAttempts: 5,
    engine,
    applier,
    evaluators: [
      predicateEvaluator("coverage-check", async (ctx) => {
        // Simulate: pass on attempt 3
        return ctx.attempt >= 3;
      }),
    ],
    // Enable local filesystem checkpointing
    checkpointing: createLocalCheckpointProvider(),
    hooks: {
      onAttemptStart(ctx) {
        console.log(`  Attempt ${ctx.attempt}...`);
      },
      onRunEnd(result) {
        console.log(`\n  Result: ${result.status}`);
        console.log(`  Pass rate: ${result.passedAttempts}/${result.totalAttempts}`);
      },
    },
    // Custom stop condition
    stopWhen: async (_ctx, results) => {
      // Stop if any evaluator passed
      return results.some((r) => r.pass);
    },
  });

  // Run the loop
  console.log("🤡 Starting loop...\n");
  const result = await loop.run();

  // Inspect the result
  console.log("\n📊 Ledger summary:");
  for (const attempt of result.ledger.attempts) {
    const icon = attempt.pass ? "✅" : "❌";
    console.log(`  ${icon} #${attempt.attempt} — ${attempt.patchSummary}`);
  }

  // You can also pause mid-loop by calling loop.pause() from a hook,
  // then later resume with loop.resume():
  //
  //   hooks: {
  //     onAttemptEnd(record) {
  //       if (record.attempt === 2) loop.pause();
  //     }
  //   }
  //
  // ... later:
  //   const resumed = await loop.resume();
}

main().catch(console.error);
