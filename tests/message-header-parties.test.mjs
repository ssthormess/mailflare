import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(tmpdir(), "mailflare-header-parties-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

await build({
	entryPoints: [join(root, "src/app/(dashboard)/inbox/[messageId]/utils.ts")],
	outfile: join(outDir, "entry.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node22",
	logLevel: "silent",
	alias: { "@": join(root, "src") },
	external: ["react", "react-dom", "next", "next/*"],
});

const { getMessageHeaderParties } = await import(pathToFileURL(join(outDir, "entry.mjs")).href);

test("inbound mail shows the address that received it, not me", () => {
	const parties = getMessageHeaderParties({
		direction: "inbound",
		fromAddr: "Ada Lovelace <ada@example.com>",
		toAddr: "Catch All <alias@phoebo.net>",
	});

	assert.equal(parties.toName, "alias@phoebo.net");
	assert.equal(parties.toName.includes("me"), false);
});

test("several inbound recipients stay as addresses", () => {
	const parties = getMessageHeaderParties({
		direction: "inbound",
		fromAddr: "ada@example.com",
		toAddr: "one@phoebo.net, Two <two@phoebo.net>",
	});

	assert.equal(parties.toName, "one@phoebo.net, two@phoebo.net");
});

test("outbound mail still uses the recipient name", () => {
	const parties = getMessageHeaderParties({
		direction: "outbound",
		fromAddr: "me@phoebo.net",
		toAddr: "Ada <ada@example.com>",
		toContactName: "Ada Lovelace",
	});

	assert.equal(parties.toName, "Ada Lovelace");
});
