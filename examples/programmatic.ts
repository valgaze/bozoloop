/**
 * Programmatic usage example.
 *
 * Shows how to use BozoLoop directly from code
 * without a config file or CLI.
 *
 * Run with: npx tsx examples/programmatic.ts
 */

import { BozoLoop } from "../src/index.js";

async function main() {
  let counter = 0;

  const loop = new BozoLoop({
    goal: "Counter reaches 3",
    workspace: ".",
    maxAttempts: 5,
    engine: {
      async suggest(ctx) {
        return {
          summary: `Increment counter (attempt ${ctx.attempt})`,
          patch: { action: "increment" },
        };
      },
    },
    applier: {
      async apply() {
        counter++;
        return { ok: true, message: `Counter is now ${counter}` };
      },
    },
    evaluators: [
      {
        name: "counter-check",
        async evaluate() {
          const pass = counter >= 3;
          return {
            name: "counter-check",
            pass,
            message: pass
              ? `Counter is ${counter} — done!`
              : `Counter is ${counter}, need 3`,
          };
        },
      },
    ],
  });

  console.log("Starting loop...\n");
  const result = await loop.run();

  console.log(`\nResult: ${result.success ? "SUCCESS" : "FAILED"}`);
  console.log(`Attempts: ${result.totalAttempts}`);
  console.log(`Final counter: ${counter}`);
}

main().catch(console.error);
