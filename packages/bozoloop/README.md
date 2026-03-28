# 🤡 bozoloop

**Iterative code loops for people who ship.**

Spec → patch → eval → repeat. Zero dependencies.

[![npm version](https://img.shields.io/npm/v/bozoloop.svg)](https://www.npmjs.com/package/bozoloop)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

BozoLoop is a small TypeScript library for running iterative code improvement loops. You give it a goal, something that proposes changes, and evaluators that say pass or fail. It handles the loop, the ledger, and the checkpointing. That's it.

```
spec → propose change → apply → evaluate → record → repeat
```

**Zero runtime dependencies.** Works with any editor, any agent, any repo.

## Why?

You already have tools that write code. What you don't have is the loop around them — apply a change, run the evals, check the result, try again.

That's all this is. Not an agent platform. Not an IDE. A loop with a ledger.

## Install

```bash
npm install bozoloop
```

## 30-Second Example

```typescript
import { createLoop, commandEvaluator } from "bozoloop";

const loop = createLoop({
  goal: "Make all tests pass",
  workspace: ".",
  maxAttempts: 5,
  engine: {
    name: "my-engine",
    async suggest(ctx) {
      // Call your LLM, run a codemod, whatever
      return {
        summary: `Fix attempt ${ctx.attempt}`,
        patch: { /* your patch data */ },
      };
    },
  },
  applier: {
    name: "my-applier",
    async apply(suggestion) {
      // Write files, apply diffs, etc.
      return { success: true };
    },
  },
  evaluators: [
    commandEvaluator("tests", "npm test"),
  ],
});

const result = await loop.run();
console.log(result.status); // "completed" | "failed"
```

## CLI

```bash
# Start a loop using bozoloop.config.ts
bozoloop run

# Resume a paused/interrupted loop
bozoloop resume

# Inspect current state and history
bozoloop inspect

# Roll back to the last checkpoint
bozoloop rollback

# Use a custom config file
bozoloop run --config my-loop.config.ts
```

## Configuration

Create a `bozoloop.config.ts` in your project root:

```typescript
import { defineConfig, commandEvaluator } from "bozoloop";

export default defineConfig({
  goal: "Make all tests pass and achieve type safety",
  spec: "All unit tests pass, no TypeScript errors",
  workspace: ".",
  maxAttempts: 10,
  engine: myEngine,
  applier: myApplier,
  evaluators: [
    commandEvaluator("tests", "npm test"),
    commandEvaluator("types", "npx tsc --noEmit"),
  ],
  hooks: {
    onAttemptStart(ctx) {
      console.log(`Attempt ${ctx.attempt}...`);
    },
    onRunEnd(result) {
      console.log(`Done: ${result.status}`);
    },
  },
});
```

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `goal` | `string` | *required* | What you're trying to achieve |
| `spec` | `string` | `goal` | Longer specification / prompt |
| `workspace` | `string` | `"."` | Path to the workspace root |
| `maxAttempts` | `number` | `10` | Maximum loop iterations |
| `engine` | `SuggestionEngine` | *required* | Proposes changes each iteration |
| `applier` | `PatchApplier` | *required* | Applies proposed changes |
| `evaluators` | `Evaluator[]` | *required* | Judges the result |
| `hooks` | `BozoLoopHooks` | `{}` | Lifecycle callbacks |
| `checkpointing` | `CheckpointProvider` | noop | Checkpoint/rollback support |
| `stopWhen` | `StopCondition` | — | Custom stop condition |
| `runtime` | `RuntimeTarget` | `"local"` | Future: `"worker"` / `"cloud"` |

## API Overview

### Core

```typescript
import { createLoop, defineConfig } from "bozoloop";

const loop = createLoop(config);
const result = await loop.run();      // Start a new loop
const resumed = await loop.resume();  // Resume from saved state
loop.pause();                         // Pause after current attempt
loop.abort();                         // Abort after current attempt
await loop.rollback();                // Roll back to last checkpoint
```

### Built-in Evaluators

```typescript
import { commandEvaluator, predicateEvaluator } from "bozoloop";

// Run a shell command — passes if exit code is 0
commandEvaluator("tests", "npm test");
commandEvaluator("lint", "npm run lint", { timeout: 30000 });

// Custom boolean predicate
predicateEvaluator("file-exists", async (ctx) => {
  return fs.existsSync(path.join(ctx.workspace, "output.json"));
});
```

### Checkpointing

```typescript
import { createLocalCheckpointProvider } from "bozoloop";

createLoop({
  // ...
  checkpointing: createLocalCheckpointProvider(),
});
```

The local checkpoint provider copies your workspace files to `.bozoloop/checkpoints/` before each attempt. You can roll back with `loop.rollback()` or `bozoloop rollback`.

### Hooks

Hooks fire around the loop lifecycle. Use them for logging, notifications, deploy previews, webhooks — whatever you need.

```typescript
const hooks: BozoLoopHooks = {
  onRunStart(ctx) { },
  onRunEnd(result) { },
  onAttemptStart(ctx) { },
  onAttemptEnd(record, ctx) { },
  onSuggestion(suggestion, ctx) { },
  onPatchApplied(suggestion, ctx) { },
  onEvalComplete(results, ctx) { },
  onPause(ctx) { },
  onResume(ctx) { },
  onAbort(ctx) { },
  onError(error, ctx) { },
};
```

## Concepts

### Suggestion Engine

Proposes a change each iteration. This is where your LLM call, codemod, template, or manual logic lives.

```typescript
interface SuggestionEngine {
  name?: string;
  suggest(ctx: LoopContext): Promise<Suggestion>;
}
```

### Patch Applier

Applies the proposed change to the workspace. Write files, apply git diffs, run a formatter — whatever you need.

```typescript
interface PatchApplier {
  name?: string;
  apply(suggestion: Suggestion, ctx: LoopContext): Promise<{ success: boolean; error?: string }>;
}
```

### Evaluator

Judges the workspace after a patch is applied. Return `pass: true` if the workspace meets expectations.

```typescript
interface Evaluator {
  name: string;
  evaluate(ctx: LoopContext): Promise<EvalResult>;
}
```

### Loop Context

Every callback receives a `LoopContext` with the goal, workspace path, current attempt number, and history of previous attempts.

```typescript
interface LoopContext {
  goal: string;
  workspace: string;
  attempt: number;
  previousAttempts: AttemptRecord[];
}
```

## Ledger & State

BozoLoop writes everything to `.bozoloop/` in your workspace:

```
.bozoloop/
  ledger.json       # Full history of every attempt
  state.json        # Current loop state (for resume)
  checkpoints/      # Workspace snapshots (if checkpointing enabled)
```

Every attempt records: attempt number, timestamp, patch summary, apply result, eval results, pass/fail, errors, and duration.

**No mystery behavior.** `bozoloop inspect` shows you everything.

## Using with Existing Projects

BozoLoop is designed to work with repos you already have:

- **After Codex/Cursor/Claude writes code** — use BozoLoop to grind on tests and evals until things actually work
- **CI/CD integration** — run BozoLoop in CI to iteratively fix failing builds
- **Alongside other agents** — BozoLoop doesn't care how changes are generated, it just loops

```typescript
// Use with any suggestion source
const engine: SuggestionEngine = {
  async suggest(ctx) {
    // Call Codex, Cursor, Claude, your own scripts...
    const patch = await myLLM.generateFix(ctx.goal, ctx.previousAttempts);
    return { summary: "LLM-generated fix", patch };
  },
};
```

## Using for New Projects

BozoLoop works just as well for bootstrapping new projects:

```typescript
createLoop({
  goal: "Create a working Express API with tests",
  workspace: "./new-project",
  engine: scaffoldEngine,
  applier: fileWriter,
  evaluators: [
    commandEvaluator("install", "npm install"),
    commandEvaluator("tests", "npm test"),
  ],
});
```

## Pause / Resume / Interrupt

BozoLoop supports basic pause/resume:

- Call `loop.pause()` from a hook — the loop finishes the current attempt and saves state
- Call `bozoloop resume` or `loop.resume()` to pick up where you left off
- State is persisted in `.bozoloop/state.json`
- The ledger continues seamlessly across pause/resume cycles

**v0.0.1 limitations:** Pause is cooperative — it takes effect between attempts, not mid-attempt. Process-level signal handling (SIGINT/SIGTERM) is not yet implemented. If the process is killed, the state file may reflect an incorrect "running" status; `resume` handles this gracefully.

## Checkpoint / Rollback

The local checkpoint provider copies workspace files before each attempt:

```typescript
import { createLocalCheckpointProvider } from "bozoloop";

createLoop({
  checkpointing: createLocalCheckpointProvider(),
  // ...
});
```

Call `loop.rollback()` or `bozoloop rollback` to restore the most recent checkpoint.

**v0.0.1 limitations:** The local provider copies all workspace files (excluding `node_modules`, `.git`, `.bozoloop`, `dist`). For large workspaces, this may be slow. A git-based checkpoint provider is planned for a future release.

## Works With Your Tools

BozoLoop is not trying to replace your editor or your favorite code agent. It's a loop primitive you plug around them.

- ✅ Works with any LLM provider (OpenAI, Anthropic, local models, none at all)
- ✅ Works with any editor (VS Code, Cursor, Neovim, whatever)
- ✅ Works with any agent (Codex, Claude, your own)
- ✅ Hooks let you call webhooks, deploy previews, notify Slack, etc.
- ✅ Ledger is plain JSON — pipe it anywhere

## Zero Dependencies

BozoLoop has zero runtime dependencies. The entire package is pure TypeScript compiled to ESM. Dev dependencies are used only for build/test tooling.

## Roadmap

**v0.0.1** (current):
- ✅ Core loop engine
- ✅ CLI (run / resume / inspect / rollback)
- ✅ Ledger & state persistence
- ✅ Cooperative pause/resume
- ✅ Local filesystem checkpointing
- ✅ Lifecycle hooks
- ✅ Built-in command & predicate evaluators
- ✅ Zero runtime dependencies

**Planned:**
- Git-based checkpoint provider
- SIGINT/SIGTERM signal handling
- Watch mode
- Parallel evaluator execution
- Remote/cloud execution runtime
- Worker/serverless runtime
- Provider-specific engine adapters (OpenAI, Anthropic, etc.)
- Web dashboard for ledger inspection
- Plugin system for community engines/evaluators

## v0.0.1 Limitations

Being honest about what's not here yet:

- **No built-in LLM integration** — you bring your own engine. Provider adapters are planned.
- **No remote execution** — loops run locally. Cloud/worker runtime is designed-for but not implemented.
- **Cooperative pause only** — pause takes effect between attempts, not mid-operation.
- **Simple checkpointing** — the local provider copies all files. Smarter diffing and git-based providers are coming.
- **No watch mode** — file-watching restart triggers are not yet implemented.
- **No parallel evaluators** — evaluators run sequentially for now.

## License

MIT © [valgaze](https://github.com/valgaze)
