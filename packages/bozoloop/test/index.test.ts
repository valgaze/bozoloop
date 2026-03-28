import { expect, test } from "bun:test";
import { greet } from "../src";

test("bozoloop package should greet correctly", () => {
	expect(greet("World")).toBe("Hello, World! Welcome to the bozoloop package.");
});
