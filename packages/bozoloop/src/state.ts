/**
 * State — persists minimal loop state for pause/resume.
 *
 * Writes to `.bozoloop/state.json` inside the workspace.
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { LoopState, LoopStatus } from "./types.ts";

const BOZOLOOP_DIR = ".bozoloop";
const STATE_FILE = "state.json";

/** Ensure the `.bozoloop/` directory exists. */
async function ensureDir(workspace: string): Promise<string> {
  const dir = join(workspace, BOZOLOOP_DIR);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Create initial state for a new run. */
export function createState(
  runId: string,
  goal: string,
  workspace: string,
  maxAttempts: number,
): LoopState {
  return {
    runId,
    status: "idle",
    currentAttempt: 0,
    maxAttempts,
    goal,
    workspace,
    lastUpdated: new Date().toISOString(),
  };
}

/** Write state to disk. */
export async function writeState(
  workspace: string,
  state: LoopState,
): Promise<void> {
  const dir = await ensureDir(workspace);
  const path = join(dir, STATE_FILE);
  state.lastUpdated = new Date().toISOString();
  await writeFile(path, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

/** Read state from disk. Returns `null` if none exists. */
export async function readState(
  workspace: string,
): Promise<LoopState | null> {
  const path = join(workspace, BOZOLOOP_DIR, STATE_FILE);
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as LoopState;
  } catch {
    return null;
  }
}

/** Update state status and persist. */
export async function updateStateStatus(
  workspace: string,
  state: LoopState,
  status: LoopStatus,
  extra?: Partial<LoopState>,
): Promise<void> {
  state.status = status;
  if (extra) Object.assign(state, extra);
  await writeState(workspace, state);
}
