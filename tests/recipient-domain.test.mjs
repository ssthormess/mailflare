import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(tmpdir(), "mailflare-recipient-domain-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

await build({
	entryPoints: [join(root, "src/lib/email/recipient-domain.ts")],
	outfile: join(outDir, "entry.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node22",
	logLevel: "silent",
	alias: { "@": join(root, "src") },
});

const { headerMatchesRecipientDomain, recipientDomainFtsQuery, recipientDomainLikePatterns } = await import(
	pathToFileURL(join(outDir, "entry.mjs")).href
);
const require = createRequire(join(root, "package.json"));
const Database = require("better-sqlite3");
const db = new Database(":memory:");
const like = db.prepare("select 1 as hit where lower(?) like ?");

function sqlMatches(header, domain) {
	return recipientDomainLikePatterns(domain).some((pattern) => like.get(header, pattern));
}

test("panorama.onl matches that domain and its subdomains only", () => {
	const domain = "panorama.onl";
	const hits = [
		"Ada <ada@panorama.onl>",
		"ada@panorama.onl, Bob <bob@phoebo.net>",
		"news@news.panorama.onl",
		"ADA@PANORAMA.ONL",
	];
	const misses = [
		"ada@panorama.com.ve",
		"ada@notpanorama.onl",
		"Ada <ada@phoebo.net>",
		'"panorama.onl" <ada@phoebo.net>',
		"bob@phoebo.net",
	];
	for (const header of hits) {
		assert.equal(headerMatchesRecipientDomain(header, domain), true, header);
		assert.equal(Boolean(sqlMatches(header, domain)), true, `sql ${header}`);
	}
	for (const header of misses) {
		assert.equal(headerMatchesRecipientDomain(header, domain), false, header);
		assert.equal(Boolean(sqlMatches(header, domain)), false, `sql ${header}`);
	}
});

test("domain query is a recipient phrase, not a bare token", () => {
	assert.equal(recipientDomainFtsQuery("panorama.onl"), '{to_addr cc_addr} : "panorama onl"');
	assert.equal(recipientDomainFtsQuery("not a domain"), null);
	assert.equal(headerMatchesRecipientDomain("ada@panorama.onl", "panorama"), false);
});
