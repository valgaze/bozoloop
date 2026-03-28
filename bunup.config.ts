import { defineWorkspace } from "bunup";

// https://bunup.dev/docs/guide/workspaces

export default defineWorkspace([
	{
		name: "bozoloop",
		root: "packages/bozoloop",
		entry: {
			index: "./src/index.ts",
			cli: "./src/cli.ts",
		},
		dts: true,
	},
]);
