import { expect, test, describe } from "bun:test";
import { createLoop, defineConfig, commandEvaluator, predicateEvaluator } from "../src/index.ts";
import type { SuggestionEngine, PatchApplier, LoopRunResult } from "../src/index.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockEngine(passFn: (attempt: number) => boolean = () => true): SuggestionEngine {
	return {
		name: "mock",
		async suggest(ctx) {
			return {
				summary: `Mock patch #${ctx.attempt}`,
				patch: { attempt: ctx.attempt },
			};
		},
	};
}

function mockApplier(): PatchApplier {
	return {
		name: "mock",
		async apply() {
			return { success: true };
		},
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createLoop", () => {
	test("runs a loop that passes on the first attempt", async () => {
		const loop = createLoop({
			goal: "test goal",
			workspace: "/tmp/bozoloop-test-pass",
			maxAttempts: 3,
			engine: mockEngine(),
			applier: mockApplier(),
			evaluators: [
				predicateEvaluator("always-pass", async () => true),
			],
		});

		const result = await loop.run();
		expect(result.status).toBe("completed");
		expect(result.totalAttempts).toBe(1);
		expect(result.passedAttempts).toBe(1);
		expect(result.failedAttempts).toBe(0);
	});

	test("runs until maxAttempts if all attempts fail", async () => {
		const loop = createLoop({
			goal: "impossible goal",
			workspace: "/tmp/bozoloop-test-fail",
			maxAttempts: 3,
			engine: mockEngine(),
			applier: mockApplier(),
			evaluators: [
				predicateEvaluator("always-fail", async () => false),
			],
		});

		const result = await loop.run();
		expect(result.status).toBe("failed");
		expect(result.totalAttempts).toBe(3);
		expect(result.passedAttempts).toBe(0);
		expect(result.failedAttempts).toBe(3);
	});

	test("passes on the Nth attempt", async () => {
		let attempt = 0;
		const loop = createLoop({
			goal: "pass on attempt 3",
			workspace: "/tmp/bozoloop-test-nth",
			maxAttempts: 5,
			engine: mockEngine(),
			applier: mockApplier(),
			evaluators: [
				predicateEvaluator("pass-on-3", async () => {
					attempt++;
					return attempt >= 3;
				}),
			],
		});

		const result = await loop.run();
		expect(result.status).toBe("completed");
		expect(result.totalAttempts).toBe(3);
	});
});

describe("defineConfig", () => {
	test("returns the same config object", () => {
		const config = defineConfig({
			goal: "test",
			engine: mockEngine(),
			applier: mockApplier(),
			evaluators: [],
		});
		expect(config.goal).toBe("test");
	});
});

describe("hooks", () => {
	test("fires lifecycle hooks", async () => {
		const calls: string[] = [];
		const loop = createLoop({
			goal: "hook test",
			workspace: "/tmp/bozoloop-test-hooks",
			maxAttempts: 1,
			engine: mockEngine(),
			applier: mockApplier(),
			evaluators: [
				predicateEvaluator("pass", async () => true),
			],
			hooks: {
				onRunStart() { calls.push("runStart"); },
				onRunEnd() { calls.push("runEnd"); },
				onAttemptStart() { calls.push("attemptStart"); },
				onAttemptEnd() { calls.push("attemptEnd"); },
				onSuggestion() { calls.push("suggestion"); },
				onPatchApplied() { calls.push("patchApplied"); },
				onEvalComplete() { calls.push("evalComplete"); },
			},
		});

		await loop.run();
		expect(calls).toEqual([
			"runStart",
			"attemptStart",
			"suggestion",
			"patchApplied",
			"evalComplete",
			"attemptEnd",
			"runEnd",
		]);
	});
});

describe("pause / abort", () => {
	test("pause stops the loop between attempts", async () => {
		let loopRef: ReturnType<typeof createLoop> | null = null;
		const loop = createLoop({
			goal: "pause test",
			workspace: "/tmp/bozoloop-test-pause",
			maxAttempts: 5,
			engine: mockEngine(),
			applier: mockApplier(),
			evaluators: [
				predicateEvaluator("fail", async () => false),
			],
			hooks: {
				onAttemptEnd(record) {
					if (record.attempt === 2) {
						loopRef!.pause();
					}
				},
			},
		});
		loopRef = loop;

		const result = await loop.run();
		expect(result.status).toBe("paused");
		expect(result.totalAttempts).toBe(2);
	});

	test("abort stops the loop", async () => {
		let loopRef: ReturnType<typeof createLoop> | null = null;
		const loop = createLoop({
			goal: "abort test",
			workspace: "/tmp/bozoloop-test-abort",
			maxAttempts: 5,
			engine: mockEngine(),
			applier: mockApplier(),
			evaluators: [
				predicateEvaluator("fail", async () => false),
			],
			hooks: {
				onAttemptEnd(record) {
					if (record.attempt === 1) {
						loopRef!.abort();
					}
				},
			},
		});
		loopRef = loop;

		const result = await loop.run();
		expect(result.status).toBe("aborted");
	});
});
