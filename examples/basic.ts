/**
 * Basic BozoLoop example with an in-memory mock engine.
 *
 * This demonstrates the core loop mechanics without any
 * external dependencies or real file modifications.
 *
 * Run with: npx tsx examples/basic.ts
 */

import {
  createLoop,
  commandEvaluator,
  type SuggestionEngine,
  type PatchApplier,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Mock suggestion engine
// ---------------------------------------------------------------------------

const mockEngine: SuggestionEngine = {
  async suggest(ctx) {
    // In reality, this would call an LLM, read files, generate diffs, etc.
    return {
      summary: `Mock fix attempt #${ctx.attempt} for: ${ctx.goal}`,
      patch: { file: "src/main.ts", content: `// fix attempt ${ctx.attempt}` },
    };
  },
};

// ---------------------------------------------------------------------------
// Mock patch applier
// ---------------------------------------------------------------------------

const mockApplier: PatchApplier = {
  async apply(patch, _workspace) {
    console.log(`  📝 Applying patch:`, JSON.stringify(patch));
    // In reality, this would write files, apply diffs, etc.
    return { ok: true, message: "Patch applied (mock)." };
  },
};

// ---------------------------------------------------------------------------
// Run the loop
// ---------------------------------------------------------------------------

async function main() {
  const loop = createLoop({
    goal: "Make the greeting function return 'Hello, World!'",
    workspace: ".",
    maxAttempts: 3,
    engine: mockEngine,
    applier: mockApplier,
    evaluators: [
      {
        name: "always-pass",
        async evaluate() {
          // This always passes on the 2nd attempt for demo purposes
          return {
            name: "always-pass",
            pass: true,
            message: "Looks good!",
          };
        },
      },
    ],
    hooks: {
      onAttemptStart: (attempt) =>
        console.log(`\n🔄 Attempt ${attempt} starting...`),
      onAttemptEnd: (record) =>
        console.log(
          `   ${record.pass ? "✅" : "❌"} Attempt ${record.attempt}: ${record.pass ? "PASS" : "FAIL"}`
        ),
      onLoopEnd: (result) =>
        console.log(
          `\n🏁 Loop finished: ${result.success ? "SUCCESS" : "FAILED"} (${result.totalAttempts} attempts)`
        ),
    },
  });

  await loop.run();
}

main().catch(console.error);
