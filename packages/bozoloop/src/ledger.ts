/**
 * Ledger — persists the full history of a loop run to disk.
 *
 * Writes to `.bozoloop/ledger.json` inside the workspace.
 * Every attempt is appended so there's zero mystery about what happened.
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AttemptRecord, LoopLedger, LoopStatus } from "./types.ts";

const BOZOLOOP_DIR = ".bozoloop";
const LEDGER_FILE = "ledger.json";

/** Ensure the `.bozoloop/` directory exists. */
async function ensureDir(workspace: string): Promise<string> {
  const dir = join(workspace, BOZOLOOP_DIR);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Create a fresh ledger for a new run. */
export function createLedger(
  runId: string,
  goal: string,
  workspace: string,
  maxAttempts: number,
): LoopLedger {
  return {
    runId,
    goal,
    workspace,
    startedAt: new Date().toISOString(),
    attempts: [],
    status: "idle",
    maxAttempts,
  };
}

/** Write the ledger to disk. */
export async function writeLedger(
  workspace: string,
  ledger: LoopLedger,
): Promise<void> {
  const dir = await ensureDir(workspace);
  const path = join(dir, LEDGER_FILE);
  await writeFile(path, JSON.stringify(ledger, null, 2) + "\n", "utf-8");
}

/** Read an existing ledger from disk. Returns `null` if none exists. */
export async function readLedger(
  workspace: string,
): Promise<LoopLedger | null> {
  const path = join(workspace, BOZOLOOP_DIR, LEDGER_FILE);
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as LoopLedger;
  } catch {
    return null;
  }
}

/** Append an attempt record to the ledger and persist. */
export async function appendAttempt(
  workspace: string,
  ledger: LoopLedger,
  record: AttemptRecord,
): Promise<void> {
  ledger.attempts.push(record);
  await writeLedger(workspace, ledger);
}

/** Update the ledger status and persist. */
export async function updateLedgerStatus(
  workspace: string,
  ledger: LoopLedger,
  status: LoopStatus,
): Promise<void> {
  ledger.status = status;
  if (status === "completed" || status === "failed" || status === "aborted") {
    ledger.endedAt = new Date().toISOString();
  }
  await writeLedger(workspace, ledger);
}
