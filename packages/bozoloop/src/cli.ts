#!/usr/bin/env node

/**
 * BozoLoop CLI
 *
 * Commands:
 *   bozoloop run       — Start a new loop from config
 *   bozoloop resume    — Resume a paused/interrupted loop
 *   bozoloop inspect   — Show status and attempt history
 *   bozoloop rollback  — Roll back to the most recent checkpoint
 *
 * Options:
 *   --config <path>    — Path to config file (default: bozoloop.config.ts)
 *   --help             — Show help
 *   --version          — Show version
 *
 * Zero runtime dependencies — no commander, no yargs.
 */

import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { readLedger } from "./ledger.ts";
import { readState } from "./state.ts";

// ---------------------------------------------------------------------------
// Arg parsing (zero deps)
// ---------------------------------------------------------------------------

interface ParsedArgs {
  command: string | undefined;
  config: string;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // skip node + script
  let command: string | undefined;
  let config = "bozoloop.config.ts";
  let help = false;
  let version = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--version" || arg === "-v") {
      version = true;
    } else if (arg === "--config" || arg === "-c") {
      config = args[++i] ?? config;
    } else if (!arg.startsWith("-") && !command) {
      command = arg;
    }
  }

  return { command, config, help, version };
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

function log(msg: string): void {
  console.log(msg);
}

function heading(msg: string): void {
  log(`\n${BOLD}${CYAN}${msg}${RESET}`);
}

function success(msg: string): void {
  log(`${GREEN}✓${RESET} ${msg}`);
}

function error(msg: string): void {
  log(`${RED}✗${RESET} ${msg}`);
}

function dim(msg: string): string {
  return `${DIM}${msg}${RESET}`;
}

function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return `${GREEN}${status}${RESET}`;
    case "failed":
    case "aborted":
      return `${RED}${status}${RESET}`;
    case "running":
      return `${CYAN}${status}${RESET}`;
    case "paused":
      return `${YELLOW}${status}${RESET}`;
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp(): void {
  log(`
${BOLD}🤡 bozoloop${RESET} — iterative code loops for people who ship

${BOLD}USAGE${RESET}
  bozoloop <command> [options]

${BOLD}COMMANDS${RESET}
  run         Start a new loop from config
  resume      Resume a paused/interrupted loop
  inspect     Show status and attempt history
  rollback    Roll back to the most recent checkpoint

${BOLD}OPTIONS${RESET}
  --config, -c <path>   Config file ${dim("(default: bozoloop.config.ts)")}
  --help, -h            Show this help
  --version, -v         Show version

${BOLD}EXAMPLES${RESET}
  ${dim("$")} bozoloop run
  ${dim("$")} bozoloop run --config my-loop.config.ts
  ${dim("$")} bozoloop inspect
  ${dim("$")} bozoloop resume
  ${dim("$")} bozoloop rollback

${dim("Spec. Patch. Eval. Repeat.")}
`);
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

async function printVersion(): Promise<void> {
  try {
    const pkgPath = new URL("../package.json", import.meta.url).pathname;
    const raw = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as { version: string };
    log(`bozoloop v${pkg.version}`);
  } catch {
    log("bozoloop v0.0.1");
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function loadConfig(configPath: string): Promise<unknown> {
  const abs = resolve(configPath);
  try {
    const mod = await import(abs);
    return mod.default ?? mod;
  } catch (err: unknown) {
    error(`Failed to load config from ${abs}`);
    error((err as Error).message);
    process.exit(1);
  }
}

async function cmdRun(configPath: string): Promise<void> {
  heading("🤡 bozoloop run");
  log("");

  const config = await loadConfig(configPath);

  // Dynamic import to avoid circular issues and keep CLI light
  const { createLoop } = await import("./loop.ts");
  const loop = createLoop(config as Parameters<typeof createLoop>[0]);

  log(`${BOLD}Goal:${RESET} ${(config as { goal?: string }).goal ?? "—"}`);
  log(
    `${BOLD}Max attempts:${RESET} ${(config as { maxAttempts?: number }).maxAttempts ?? 10}`,
  );
  log("");

  const result = await loop.run();

  log("");
  heading("Results");
  log(`  Status:   ${statusColor(result.status)}`);
  log(`  Attempts: ${result.totalAttempts}`);
  log(`  Passed:   ${GREEN}${result.passedAttempts}${RESET}`);
  log(`  Failed:   ${RED}${result.failedAttempts}${RESET}`);
  log(`  Run ID:   ${dim(result.runId)}`);
  log("");

  if (result.status === "completed") {
    success("Loop completed successfully!");
  } else if (result.status === "paused") {
    log(`${YELLOW}⏸${RESET}  Loop paused. Run ${BOLD}bozoloop resume${RESET} to continue.`);
  } else {
    error(`Loop ended with status: ${result.status}`);
  }
}

async function cmdResume(configPath: string): Promise<void> {
  heading("🤡 bozoloop resume");
  log("");

  const config = await loadConfig(configPath);
  const { createLoop } = await import("./loop.ts");
  const loop = createLoop(config as Parameters<typeof createLoop>[0]);

  const result = await loop.resume();

  log("");
  heading("Results");
  log(`  Status:   ${statusColor(result.status)}`);
  log(`  Attempts: ${result.totalAttempts}`);
  log(`  Passed:   ${GREEN}${result.passedAttempts}${RESET}`);
  log(`  Failed:   ${RED}${result.failedAttempts}${RESET}`);
  log("");
}

async function cmdInspect(): Promise<void> {
  heading("🤡 bozoloop inspect");
  log("");

  const workspace = resolve(".");
  const state = await readState(workspace);
  const ledger = await readLedger(workspace);

  if (!state && !ledger) {
    log(`  ${dim("No loop state found in this workspace.")}`);
    log(`  ${dim("Run")} ${BOLD}bozoloop run${RESET} ${dim("to start.")}`);
    return;
  }

  if (state) {
    log(`${BOLD}State${RESET}`);
    log(`  Run ID:     ${dim(state.runId)}`);
    log(`  Status:     ${statusColor(state.status)}`);
    log(`  Attempt:    ${state.currentAttempt} / ${state.maxAttempts}`);
    log(`  Goal:       ${state.goal}`);
    log(`  Workspace:  ${dim(state.workspace)}`);
    log(`  Updated:    ${dim(state.lastUpdated)}`);
    if (state.checkpointId) {
      log(`  Checkpoint: ${dim(state.checkpointId)}`);
    }
    log("");
  }

  if (ledger) {
    log(`${BOLD}Ledger${RESET}  ${dim(`(${ledger.attempts.length} attempts)`)}`);
    log(`  Started:  ${dim(ledger.startedAt)}`);
    if (ledger.endedAt) {
      log(`  Ended:    ${dim(ledger.endedAt)}`);
    }
    log("");

    if (ledger.attempts.length > 0) {
      log(`${BOLD}Attempts${RESET}`);
      for (const a of ledger.attempts) {
        const icon = a.pass ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
        const duration = a.durationMs ? dim(` (${a.durationMs}ms)`) : "";
        log(`  ${icon} #${a.attempt} ${a.patchSummary}${duration}`);
        if (a.error) {
          log(`    ${RED}Error: ${a.error}${RESET}`);
        }
        for (const ev of a.evalResults) {
          const evIcon = ev.pass ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
          log(`    ${evIcon} ${ev.name}${ev.message ? ": " + dim(ev.message.slice(0, 120)) : ""}`);
        }
      }
      log("");
    }

    // Summary
    const passed = ledger.attempts.filter((a) => a.pass).length;
    const failed = ledger.attempts.filter((a) => !a.pass).length;
    log(`${BOLD}Summary${RESET}`);
    log(`  Total:  ${ledger.attempts.length}`);
    log(`  Passed: ${GREEN}${passed}${RESET}`);
    log(`  Failed: ${RED}${failed}${RESET}`);
    log("");
  }
}

async function cmdRollback(configPath: string): Promise<void> {
  heading("🤡 bozoloop rollback");
  log("");

  const config = await loadConfig(configPath);
  const { createLoop } = await import("./loop.ts");
  const loop = createLoop(config as Parameters<typeof createLoop>[0]);

  try {
    await loop.rollback();
    success("Rolled back to most recent checkpoint.");
  } catch (err: unknown) {
    error((err as Error).message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (parsed.version) {
    await printVersion();
    return;
  }

  if (parsed.help || !parsed.command) {
    printHelp();
    return;
  }

  switch (parsed.command) {
    case "run":
      await cmdRun(parsed.config);
      break;
    case "resume":
      await cmdResume(parsed.config);
      break;
    case "inspect":
      await cmdInspect();
      break;
    case "rollback":
      await cmdRollback(parsed.config);
      break;
    default:
      error(`Unknown command: ${parsed.command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  error((err as Error).message ?? String(err));
  process.exit(1);
});
