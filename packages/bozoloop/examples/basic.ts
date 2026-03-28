/**
 * Basic example — in-memory mock engine
 *
 * Demonstrates the core BozoLoop API with a mock suggestion engine
 * that doesn't actually modify files. Good for understanding the flow.
 *
 * Run: npx tsx examples/basic.ts
 */

import {
  createLoop,
  commandEvaluator,
  predicateEvaluator,
  type SuggestionEngine,
  type PatchApplier,
} from "../src/index.ts";

// A mock engine that "generates" a patch (just returns a summary)
const mockEngine: SuggestionEngine = {
  name: "mock-engine",
  async suggest(ctx) {
    return {
      summary: `Mock patch for attempt ${ctx.attempt}: tweak code to satisfy goal`,
      patch: {
        file: "src/main.ts",
        content: `// attempt ${ctx.attempt}\nconsole.log("hello");`,
      },
    };
  },
};

// A mock applier that pretends to apply the patch
const mockApplier: PatchApplier = {
  name: "mock-applier",
  async apply(suggestion, _ctx) {
    console.log(`  📝 Applying: ${suggestion.summary}`);
    // In a real applier, you'd write files here
    return { success: true };
  },
};

// Run the loop
async function main() {
  const loop = createLoop({
    goal: "Make the greeting function return the correct output",
    workspace: ".",
    maxAttempts: 3,
    engine: mockEngine,
    applier: mockApplier,
    evaluators: [
      // This will fail because there's no test script — that's OK for a demo
      predicateEvaluator("always-pass", async () => {
        // Simulate: pass on the 2nd attempt
        return Math.random() > 0.5;
      }),
    ],
    hooks: {
      onAttemptStart(ctx) {
        console.log(`\n🔄 Attempt ${ctx.attempt}/${3}`);
      },
      onAttemptEnd(record) {
        const icon = record.pass ? "✅" : "❌";
        console.log(`  ${icon} Attempt ${record.attempt}: ${record.pass ? "PASS" : "FAIL"}`);
      },
      onRunEnd(result) {
        console.log(`\n🏁 Loop finished: ${result.status}`);
        console.log(`   ${result.passedAttempts} passed, ${result.failedAttempts} failed`);
      },
    },
  });

  await loop.run();
}

main().catch(console.error);
