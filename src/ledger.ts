import * as fs from "node:fs";
import * as path from "node:path";
import type { AttemptRecord, LoopLedger } from "./types.js";

const LEDGER_FILE = "ledger.json";

/**
 * Manages the on-disk ledger of attempt records.
 *
 * The ledger is the single source of truth for what happened
 * during a loop run. Every attempt is recorded with full detail
 * so there is never any mystery about what BozoLoop did.
 */
export class Ledger {
  private filePath: string;
  private data: LoopLedger;

  constructor(stateDir: string, goal: string, workspace: string) {
    this.filePath = path.join(stateDir, LEDGER_FILE);

    if (fs.existsSync(this.filePath)) {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      this.data = JSON.parse(raw) as LoopLedger;
    } else {
      this.data = {
        goal,
        workspace,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attempts: [],
      };
    }
  }

  /** Append a completed attempt record to the ledger and flush to disk. */
  record(attempt: AttemptRecord): void {
    this.data.attempts.push(attempt);
    this.data.updatedAt = new Date().toISOString();
    this.flush();
  }

  /** Get all recorded attempts. */
  getAttempts(): AttemptRecord[] {
    return this.data.attempts;
  }

  /** Get the full ledger data. */
  getData(): LoopLedger {
    return this.data;
  }

  /** Write current state to disk. */
  private flush(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }
}
