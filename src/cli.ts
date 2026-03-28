#!/usr/bin/env node

/**
 * BozoLoop CLI
 *
 * Usage:
 *   bozoloop run      [--config path]   Run the loop
 *   bozoloop resume   [--config path]   Resume a paused loop
 *   bozoloop inspect  [--config path]   Inspect state and ledger
 *   bozoloop rollback [--config path]   Rollback to last checkpoint
 *   bozoloop --help                     Show help
 *   bozoloop --version                  Show version
 *
 * Zero dependencies. Manually parsed.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { BozoLoopConfig } from "./types.js";
import { BozoLoop } from "./loop.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function printHelp(): void {
  console.log(`
🤡 bozoloop — self-improving code loops

Usage:
  bozoloop <command> [options]

Commands:
  run        Run the loop from the beginning
  resume     Resume a paused loop
  inspect    Show loop state, last attempt, and totals
  rollback   Rollback workspace to last checkpoint

Options:
  --config <path>   Path to config file (default: bozoloop.config.ts)
  --help            Show this help message
  --version         Show version number
`);
}

function printVersion(): void {
  // Read version from package.json at build time isn't possible without
  // bundling, so we just hardcode for v0.0.1. This is fine.
  console.log("bozoloop v0.0.1");
}

async function loadConfig(configPath: string): Promise<BozoLoopConfig> {
  const resolved = path.resolve(configPath);

  if (!fs.existsSync(resolved)) {
    console.error(`Config file not found: ${resolved}`);
    process.exit(1);
  }

  // For .ts files, we need tsx or a similar loader.
  // For .js/.mjs files, we can import directly.
  // Try dynamic import — user is expected to have compiled their config
  // or use a loader like tsx.
  try {
    const fileUrl = pathToFileURL(resolved).href;
    const mod = await import(fileUrl);
    const config = mod.default ?? mod;

    if (!config.goal || !config.engine || !config.applier || !config.evaluators) {
      console.error(
        "Invalid config: must export { goal, engine, applier, evaluators } at minimum."
      );
      process.exit(1);
    }

    return config as BozoLoopConfig;
  } catch (err) {
    console.error(`Failed to load config: ${resolved}`);
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdRun(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);
  const loop = new BozoLoop(config);

  console.log(`\n🤡 BozoLoop — starting run`);
  console.log(`   Goal: ${config.goal}`);
  console.log(`   Workspace: ${path.resolve(config.workspace)}`);
  console.log(`   Max attempts: ${config.maxAttempts ?? 10}`);
  console.log(`   Evaluators: ${config.evaluators.map((e) => e.name).join(", ")}`);
  console.log("");

  const result = await loop.run();

  console.log(`\n${"—".repeat(50)}`);
  if (result.success) {
    console.log(`✅ Loop completed successfully!`);
  } else {
    console.log(`❌ Loop ended: ${result.status}`);
  }
  console.log(`   Total attempts: ${result.totalAttempts}`);
  console.log(`   Duration: ${formatDuration(result.durationMs)}`);
  console.log(`   Passed: ${result.attempts.filter((a) => a.pass).length}`);
  console.log(`   Failed: ${result.attempts.filter((a) => !a.pass).length}`);
  console.log("");

  process.exit(result.success ? 0 : 1);
}

async function cmdResume(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);
  const loop = new BozoLoop(config);

  console.log(`\n🤡 BozoLoop — resuming loop`);
  console.log(`   Goal: ${config.goal}\n`);

  try {
    const result = await loop.resume();

    console.log(`\n${"—".repeat(50)}`);
    if (result.success) {
      console.log(`✅ Loop completed successfully!`);
    } else {
      console.log(`❌ Loop ended: ${result.status}`);
    }
    console.log(`   Total attempts: ${result.totalAttempts}`);
    console.log(`   Duration: ${formatDuration(result.durationMs)}`);
    console.log("");

    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

async function cmdInspect(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);
  const loop = new BozoLoop(config);
  const { state, ledger } = loop.inspect();

  console.log(`\n🤡 BozoLoop — inspection\n`);

  // Status
  const statusEmoji: Record<string, string> = {
    idle: "⬜",
    running: "🔄",
    paused: "⏸️ ",
    completed: "✅",
    failed: "❌",
    aborted: "🛑",
  };
  console.log(`Status:  ${statusEmoji[state.status] ?? "?"} ${state.status}`);
  console.log(`Goal:    ${ledger.goal}`);
  console.log(`Attempt: ${state.currentAttempt} / ${state.maxAttempts}`);
  console.log(`Created: ${ledger.createdAt}`);
  console.log(`Updated: ${state.updatedAt}`);
  console.log("");

  // Totals
  const total = ledger.attempts.length;
  const passed = ledger.attempts.filter((a) => a.pass).length;
  const failed = total - passed;
  console.log(`Attempts: ${total} total, ${passed} passed, ${failed} failed`);

  // Last attempt
  if (total > 0) {
    const last = ledger.attempts[total - 1]!;
    console.log(`\nLast attempt (#${last.attempt}):`);
    console.log(`  Time:    ${last.timestamp}`);
    console.log(`  Patch:   ${last.patchSummary}`);
    console.log(`  Applied: ${last.applyResult.ok ? "yes" : "no"}`);
    console.log(`  Pass:    ${last.pass ? "yes" : "no"}`);
    console.log(`  Duration: ${formatDuration(last.durationMs)}`);
    if (last.evalResults.length > 0) {
      console.log(`  Evals:`);
      for (const er of last.evalResults) {
        console.log(`    ${er.pass ? "✅" : "❌"} ${er.name}${er.message ? `: ${er.message.slice(0, 80)}` : ""}`);
      }
    }
    if (last.note) {
      console.log(`  Note: ${last.note}`);
    }
  } else {
    console.log("\nNo attempts recorded yet.");
  }

  console.log("");
}

async function cmdRollback(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);
  const loop = new BozoLoop(config);

  console.log(`\n🤡 BozoLoop — rolling back to last checkpoint\n`);

  try {
    await loop.rollback();
    console.log(`✅ Rollback complete.\n`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (hasFlag(args, "--help") || hasFlag(args, "-h") || !command) {
    printHelp();
    return;
  }

  if (hasFlag(args, "--version") || hasFlag(args, "-v")) {
    printVersion();
    return;
  }

  const configPath = getArg(args, "--config") ?? "bozoloop.config.js";

  switch (command) {
    case "run":
      await cmdRun(configPath);
      break;
    case "resume":
      await cmdResume(configPath);
      break;
    case "inspect":
      await cmdInspect(configPath);
      break;
    case "rollback":
      await cmdRollback(configPath);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
