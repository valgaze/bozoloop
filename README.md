# 🤡 bozoloop

**Self-improving code loops for people who ship.**

Spec. Patch. Eval. Repeat.

[![npm version](https://img.shields.io/npm/v/bozoloop.svg)](https://www.npmjs.com/package/bozoloop)
[![license](https://img.shields.io/npm/l/bozoloop.svg)](./LICENSE)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](#zero-dependencies)

---

BozoLoop is a zero-dependency, TypeScript-first library for running iterative code improvement loops. You supply a goal, a way to generate changes, and evaluators — BozoLoop handles the loop, ledger, pause/resume, and checkpoint mechanics.

**Mental model:**

```
spec → propose change → apply change → run evals → record result → repeat
```

BozoLoop is **not** an agent platform, IDE plugin, or opinionated framework. It's a tiny composable primitive you plug into your existing workflow.

## Why BozoLoop?

Most "self-improving code" tools are bloated agent platforms that try to own your entire workflow. BozoLoop is the opposite:

- **Zero runtime dependencies** — nothing to audit, nothing to break
- **Bring your own engine** — call any LLM, script, or tool to generate changes
- **Works with your tools** — augments Codex, Cursor, Claude, or any other agent
- **Inspectable** — every attempt is ledgered to disk in plain JSON
- **Composable** — use from code, CLI, or wrap in your own automation
- **Resumable** — pause, resume, abort, rollback between attempts

## Install

```bash
npm install bozoloop
```

## 30-Second Example

```typescript
import { createLoop, commandEvaluator } from "bozoloop";

const result = await createLoop({
  goal: "All tests pass",
  workspace: ".",
  maxAttempts: 10,
  engine: {
    async suggest(ctx) {
      // Call your LLM, read files, generate diffs — whatever you want
      return {
        summary: `Fix attempt #${ctx.attempt}`,
        patch: { /* your patch data */ },
      };
    },
  },
  applier: {
    async apply(patch, workspace) {
      // Write files, apply diffs, run formatters
      return { ok: true, message: "Applied." };
    },
  },
  evaluators: [
    commandEvaluator("tests", "npm test"),
  ],
}).run();

console.log(result.success ? "✅ Done!" : "❌ Failed");
```

## Config File

Create a `bozoloop.config.ts` (or `.js`) for reusable setups:

```typescript
import { defineConfig, commandEvaluator } from "bozoloop";

export default defineConfig({
  goal: "All tests and type checks pass",
  workspace: ".",
  maxAttempts: 10,
  engine: myEngine,
  applier: myApplier,
  evaluators: [
    commandEvaluator("tests", "npm test"),
    commandEvaluator("types", "npx tsc --noEmit"),
    commandEvaluator("lint", "npm run lint"),
  ],
  hooks: {
    onAttemptEnd: (record) => {
      console.log(`#${record.attempt} ${record.pass ? "✅" : "❌"}`);
    },
  },
});
```

## CLI

```bash
# Run the loop
bozoloop run --config bozoloop.config.js

# Resume a paused loop
bozoloop resume --config bozoloop.config.js

# Inspect state and ledger
bozoloop inspect --config bozoloop.config.js

# Rollback to last checkpoint
bozoloop rollback --config bozoloop.config.js
```

The CLI is zero-dependency (no commander/yargs). It reads your config, runs the loop, and writes state to `.bozoloop/`.

## API Overview

### Core

| Export | Description |
|---|---|
| `createLoop(config)` | Create a BozoLoop instance |
| `BozoLoop` | The loop class (also usable directly with `new`) |
| `defineConfig(config)` | Type-safe config helper for config files |
| `commandEvaluator(name, cmd)` | Create an evaluator from a shell command |
| `FileCheckpointProvider` | Filesystem-based checkpoint/rollback provider |

### Interfaces

| Interface | Role |
|---|---|
| `SuggestionEngine` | Proposes changes given current context |
| `PatchApplier` | Applies a proposed change to the workspace |
| `Evaluator` | Evaluates the workspace, returns pass/fail |
| `CheckpointProvider` | Creates and restores workspace snapshots |
| `BozoLoopHooks` | Lifecycle hooks for observability and integration |

### Loop Methods

```typescript
const loop = createLoop(config);

await loop.run();        // Run from beginning
await loop.resume();     // Resume a paused loop
loop.pause();            // Pause (takes effect between attempts)
loop.abort();            // Abort (takes effect between attempts)
await loop.rollback();   // Rollback to last checkpoint
loop.inspect();          // Get { state, ledger } data
```

## Concepts

### Suggestion Engine

Your engine proposes a change. It receives the goal, workspace path, current attempt number, and all previous attempt records. Return a `summary` and a `patch` (any shape — your applier knows how to interpret it).

### Patch Applier

Takes the `patch` from your engine and applies it to the workspace. Could write files, apply git diffs, run code generators — whatever you need.

### Evaluators

Run after each patch is applied. All evaluators must pass for an attempt to succeed. `commandEvaluator` is the built-in helper for running shell commands (test suites, linters, type checkers, etc).

### Hooks

Fire at every stage of the loop lifecycle:

```typescript
hooks: {
  onLoopStart, onLoopEnd,
  onAttemptStart, onAttemptEnd,
  onSuggestion, onApply, onEval,
  onPause, onResume, onAbort,
}
```

Use hooks to log, send webhooks, deploy previews, notify Slack, or integrate with external systems.

### Ledger

Every attempt is recorded to `.bozoloop/ledger.json` with full detail:
- Attempt number and timestamp
- Patch summary
- Apply result
- Eval results (per evaluator)
- Overall pass/fail
- Duration and notes

No mystery behavior. Everything is inspectable.

## Using with Existing Workspaces

BozoLoop works great for grinding on an existing codebase:

```bash
cd my-project
# Set up your bozoloop config
bozoloop run --config bozoloop.config.js
```

Use it after Codex/Cursor/Claude writes code — BozoLoop can iterate until tests pass, types check, or any other condition is met.

## Using for New Projects

BozoLoop also works for bootstrapping new projects from scratch. Point it at an empty directory with a spec and let it iterate:

```typescript
createLoop({
  goal: "Create a working Express API with auth",
  spec: "REST API with JWT auth, user CRUD, PostgreSQL...",
  workspace: "./new-project",
  // ...
});
```

## Pause / Resume / Interrupt

BozoLoop supports basic pause/resume semantics in v0.0.1:

- **Programmatic:** Call `loop.pause()` — the loop stops after the current attempt finishes
- **External:** Write `"paused"` or `"aborted"` to `.bozoloop/state.json` `status` field — the loop checks this between attempts
- **Resume:** Call `loop.resume()` or use `bozoloop resume` from CLI

**v0.0.1 limitations:**
- Pause/abort take effect *between* attempts, not mid-attempt
- Process-level signal handling (SIGINT, etc.) is not yet implemented
- Robust distributed orchestration is planned for future versions

## Checkpoint / Rollback

BozoLoop includes a simple filesystem checkpoint provider:

```typescript
import { FileCheckpointProvider } from "bozoloop";

createLoop({
  // ...
  checkpoint: new FileCheckpointProvider(".bozoloop"),
});
```

Before each attempt, the workspace is snapshotted to `.bozoloop/checkpoints/`. Use `loop.rollback()` or `bozoloop rollback` to restore the last checkpoint.

**v0.0.1 limitations:**
- Copies entire workspace (minus node_modules, .git, dist)
- Not efficient for very large repos
- Git-based checkpoint provider is planned

## Works With Your Tools

BozoLoop is designed to complement, not replace, your existing workflow:

- ✅ **Codex / Cursor / Claude** — use as the suggestion engine
- ✅ **Any LLM API** — OpenAI, Anthropic, local models, etc.
- ✅ **Existing test suites** — via `commandEvaluator`
- ✅ **CI/CD** — run BozoLoop in your pipeline
- ✅ **Webhooks / Slack / etc.** — via hooks
- ✅ **Git** — works naturally with git workflows
- ✅ **Any editor** — it's just a library/CLI, not an IDE plugin

## Zero Dependencies

BozoLoop has **zero runtime dependencies**. The only devDependencies are TypeScript and `@types/node` for the build. Your `node_modules` stays clean.

## Roadmap

**v0.0.1 (current) — Foundation**
- ✅ Core loop mechanics
- ✅ Typed config with `defineConfig`
- ✅ CLI (run / resume / inspect / rollback)
- ✅ Ledger and state persistence
- ✅ Pause / resume / abort
- ✅ Filesystem checkpoints
- ✅ Command evaluators
- ✅ Lifecycle hooks

**Planned**
- 🔜 Git-based checkpoint provider
- 🔜 Process signal handling (SIGINT graceful shutdown)
- 🔜 Built-in diff/file patch applier
- 🔜 Watch mode
- 🔜 Parallel evaluator execution
- 🔜 Cloud runner (serverless / worker environments)
- 🔜 Provider integrations (OpenAI, Anthropic, etc.)
- 🔜 Web dashboard for ledger inspection
- 🔜 `bozoloop init` scaffolding command

## v0.0.1 Limitations

Being honest about what this version does and doesn't do:

- **No built-in LLM integrations** — bring your own engine
- **No built-in patch format** — bring your own applier
- **Pause is cooperative** — checked between attempts, not mid-execution
- **Checkpoints copy files** — not efficient for huge repos
- **No cloud/worker runtime** — local execution only for now
- **CLI requires compiled config** — use `tsx` or compile `.ts` to `.js` first

This is a real, working package — not vaporware. These limitations are honest constraints of a v0.0.1, not missing features hidden behind abstractions.

## License

MIT

---

<p align="center">
  <strong>bozoloop</strong> — because your code should improve itself,<br>
  and you shouldn't need a circus to make it happen. 🤡
</p>
