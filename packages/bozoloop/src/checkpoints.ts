/**
 * Checkpoint provider — local filesystem implementation.
 *
 * Creates snapshots of workspace files in `.bozoloop/checkpoints/<id>/`.
 * This is intentionally simple: it copies the entire workspace (excluding
 * node_modules, .git, .bozoloop, and dist) into the checkpoint directory.
 *
 * Limitations in v0.0.1:
 * - Copies files naively (no dedup, no compression)
 * - Does not track which files the patch touched (copies everything)
 * - For large workspaces, consider a git-based checkpoint provider instead
 *
 * Future directions: git stash/branch provider, container snapshots,
 * remote checkpoint storage.
 */

import {
  mkdir,
  readdir,
  copyFile,
  stat,
  rm,
} from "node:fs/promises";
import { join, relative } from "node:path";
import type { CheckpointProvider, LoopContext } from "./types.ts";

const BOZOLOOP_DIR = ".bozoloop";
const CHECKPOINTS_DIR = "checkpoints";

/** Directories to skip when copying. */
const IGNORE = new Set(["node_modules", ".git", BOZOLOOP_DIR, "dist"]);

/** Recursively list all files in a directory, respecting ignore list. */
async function listFiles(dir: string, root: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const rel = relative(root, join(dir, entry.name));
    const topLevel = rel.split("/")[0];
    if (topLevel && IGNORE.has(topLevel)) continue;

    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full, root)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }

  return files;
}

/**
 * Creates a local filesystem checkpoint provider.
 *
 * Checkpoints are stored in `.bozoloop/checkpoints/<id>/` and can be
 * restored to roll back the workspace.
 */
export function createLocalCheckpointProvider(): CheckpointProvider {
  return {
    name: "local-fs",

    async create(ctx: LoopContext): Promise<string> {
      const id = `checkpoint-${ctx.attempt}-${Date.now()}`;
      const checkpointDir = join(
        ctx.workspace,
        BOZOLOOP_DIR,
        CHECKPOINTS_DIR,
        id,
      );
      await mkdir(checkpointDir, { recursive: true });

      const files = await listFiles(ctx.workspace, ctx.workspace);
      for (const file of files) {
        const rel = relative(ctx.workspace, file);
        const dest = join(checkpointDir, rel);
        await mkdir(join(dest, ".."), { recursive: true });
        await copyFile(file, dest);
      }

      return id;
    },

    async restore(checkpointId: string, ctx: LoopContext): Promise<void> {
      const checkpointDir = join(
        ctx.workspace,
        BOZOLOOP_DIR,
        CHECKPOINTS_DIR,
        checkpointId,
      );

      // Verify checkpoint exists
      await stat(checkpointDir);

      const files = await listFiles(checkpointDir, checkpointDir);
      for (const file of files) {
        const rel = relative(checkpointDir, file);
        const dest = join(ctx.workspace, rel);
        await mkdir(join(dest, ".."), { recursive: true });
        await copyFile(file, dest);
      }
    },

    async list(ctx: LoopContext): Promise<string[]> {
      const dir = join(ctx.workspace, BOZOLOOP_DIR, CHECKPOINTS_DIR);
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        return entries
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort();
      } catch {
        return [];
      }
    },
  };
}

/**
 * No-op checkpoint provider for when checkpointing is not needed.
 */
export function createNoopCheckpointProvider(): CheckpointProvider {
  return {
    name: "noop",
    async create(): Promise<string> {
      return `noop-${Date.now()}`;
    },
    async restore(): Promise<void> {
      // no-op
    },
    async list(): Promise<string[]> {
      return [];
    },
  };
}

/**
 * Remove a checkpoint directory from disk.
 */
export async function removeCheckpoint(
  workspace: string,
  checkpointId: string,
): Promise<void> {
  const dir = join(workspace, BOZOLOOP_DIR, CHECKPOINTS_DIR, checkpointId);
  await rm(dir, { recursive: true, force: true });
}
