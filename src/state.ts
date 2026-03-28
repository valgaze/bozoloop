import * as fs from "node:fs";
import * as path from "node:path";
import type { LoopState, LoopStatus } from "./types.js";

const STATE_FILE = "state.json";

/**
 * Manages the on-disk state used for pause / resume / abort semantics.
 *
 * State is separate from the ledger: the ledger is append-only history,
 * while state tracks the current operational status of the loop.
 */
export class State {
  private filePath: string;
  private data: LoopState;

  constructor(stateDir: string, maxAttempts: number) {
    this.filePath = path.join(stateDir, STATE_FILE);

    if (fs.existsSync(this.filePath)) {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      this.data = JSON.parse(raw) as LoopState;
    } else {
      this.data = {
        status: "idle",
        currentAttempt: 0,
        maxAttempts,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  get status(): LoopStatus {
    return this.data.status;
  }

  get currentAttempt(): number {
    return this.data.currentAttempt;
  }

  /** Update status and persist. */
  setStatus(status: LoopStatus): void {
    this.data.status = status;
    this.data.updatedAt = new Date().toISOString();
    this.flush();
  }

  /** Increment the attempt counter and persist. */
  incrementAttempt(): number {
    this.data.currentAttempt += 1;
    this.data.updatedAt = new Date().toISOString();
    this.flush();
    return this.data.currentAttempt;
  }

  /** Get a read-only copy of the state data. */
  getData(): LoopState {
    return { ...this.data };
  }

  /** Check if the loop should stop based on a pause/abort flag. */
  shouldStop(): boolean {
    // Re-read from disk to pick up external pause/abort signals
    if (fs.existsSync(this.filePath)) {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      const fresh = JSON.parse(raw) as LoopState;
      this.data.status = fresh.status;
    }
    return this.data.status === "paused" || this.data.status === "aborted";
  }

  private flush(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }
}
