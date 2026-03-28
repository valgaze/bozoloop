import * as fs from "node:fs";
import * as path from "node:path";
import type { CheckpointProvider } from "./types.js";

/**
 * A simple filesystem-based checkpoint provider.
 *
 * Creates checkpoints by copying all non-ignored files in the workspace
 * into `.bozoloop/checkpoints/<label>/`. Restore copies them back.
 *
 * Limitations (v0.0.1):
 * - Copies everything in the workspace (no smart diffing)
 * - Does not handle very large workspaces efficiently
 * - Does not integrate with git (planned for future)
 * - Symlinks are not preserved
 *
 * For most small-to-medium projects this works fine.
 * For large repos, consider a git-based provider (coming soon).
 */
export class FileCheckpointProvider implements CheckpointProvider {
  private baseDir: string;

  /** Directories to skip when copying. */
  private static SKIP = new Set([
    "node_modules",
    ".git",
    ".bozoloop",
    "dist",
    ".next",
    "__pycache__",
  ]);

  constructor(stateDir: string) {
    this.baseDir = path.join(stateDir, "checkpoints");
  }

  async create(workspace: string, label: string): Promise<string> {
    const id = `${label}-${Date.now()}`;
    const dest = path.join(this.baseDir, id);
    this.copyDir(workspace, dest);
    return id;
  }

  async restore(workspace: string, checkpointId: string): Promise<void> {
    const src = path.join(this.baseDir, checkpointId);
    if (!fs.existsSync(src)) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }
    this.copyDir(src, workspace);
  }

  async list(_workspace: string): Promise<string[]> {
    if (!fs.existsSync(this.baseDir)) return [];
    return fs.readdirSync(this.baseDir).sort();
  }

  private copyDir(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      if (FileCheckpointProvider.SKIP.has(entry.name)) continue;

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDir(srcPath, destPath);
      } else if (entry.isFile()) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

/**
 * A no-op checkpoint provider for when you don't need rollback.
 */
export class NoopCheckpointProvider implements CheckpointProvider {
  async create(_workspace: string, _label: string): Promise<string> {
    return "noop";
  }
  async restore(_workspace: string, _checkpointId: string): Promise<void> {
    // nothing to restore
  }
  async list(_workspace: string): Promise<string[]> {
    return [];
  }
}
