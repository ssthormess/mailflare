import JSZip from "jszip";

export const MAX_DOCX_BYTES = 25 * 1024 * 1024;
// A `.docx` is a zip; a tiny file can expand to gigabytes. Cap the total
// declared uncompressed size (read from the zip central directory, no
// decompression) so a decompression bomb cannot lock up the tab.
export const MAX_DOCX_UNCOMPRESSED_BYTES = 150 * 1024 * 1024;

/**
 * Rejects a document that is too big to render in the browser, whether by raw
 * size or by declared uncompressed size. Throws a user-facing message.
 */
export async function assertDocxWithinSizeLimits(data: ArrayBuffer): Promise<void> {
	if (data.byteLength > MAX_DOCX_BYTES) {
		throw new Error("This document is too large to preview");
	}

	let zip: JSZip;
	try {
		zip = await JSZip.loadAsync(data);
	} catch {
		throw new Error("This file is not a readable Word document");
	}

	let uncompressed = 0;
	for (const entry of Object.values(zip.files)) {
		uncompressed += (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
		if (uncompressed > MAX_DOCX_UNCOMPRESSED_BYTES) {
			throw new Error("This document is too large to preview");
		}
	}
}

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const SAFE_RESOURCE_PROTOCOLS = new Set(["data:", "blob:"]);
const FORBIDDEN_ELEMENTS = "script, iframe, object, embed, form, link, base, meta, frame, frameset";
const RESOURCE_ATTRIBUTES = new Set(["src", "poster", "xlink:href"]);

function toUrl(raw: string): URL | null {
	try {
		return new URL(raw, window.location.origin);
	} catch {
		return null;
	}
}

function isInlineResource(raw: string): boolean {
	const url = toUrl(raw.trim());
	return url !== null && SAFE_RESOURCE_PROTOCOLS.has(url.protocol);
}

/**
 * CSS in a document can point at remote origins (`@import`, `url(http://…)`),
 * which lets a malicious `.docx` phone home — trackers, IP leaks, or CSS-based
 * exfiltration. Keep inline `data:`/`blob:` resources (fonts, images), drop the rest.
 */
function sanitizeCss(css: string): string {
	return css
		.replace(/@import[^;]*;?/gi, "")
		.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (match, _quote, inner) =>
			isInlineResource(inner) ? match : "none",
		);
}

/**
 * A `.docx` is untrusted input. docx-preview builds the DOM programmatically, so
 * document text cannot inject scripts — but hyperlink relationships, VML/SVG
 * attributes, and document styles are all attacker-controlled. This strips every
 * way the rendered tree could execute script or reach the network.
 */
export function sanitizeRenderedDocx(container: HTMLElement): void {
	container.querySelectorAll(FORBIDDEN_ELEMENTS).forEach((node) => node.remove());

	container.querySelectorAll("*").forEach((element) => {
		for (const attribute of Array.from(element.attributes)) {
			const name = attribute.name.toLowerCase();
			if (name.startsWith("on") || name === "srcdoc") {
				element.removeAttribute(attribute.name);
				continue;
			}
			if (name === "srcset") {
				element.removeAttribute(attribute.name);
				continue;
			}
			const isLink = name === "href" && element.tagName.toLowerCase() === "a";
			if (isLink) continue;
			if (RESOURCE_ATTRIBUTES.has(name) || name === "href") {
				if (!isInlineResource(attribute.value)) element.removeAttribute(attribute.name);
			}
		}
		const style = element.getAttribute("style");
		if (style && /url\(|@import/i.test(style)) element.setAttribute("style", sanitizeCss(style));
	});

	container.querySelectorAll("style").forEach((element) => {
		const css = element.textContent ?? "";
		if (/url\(|@import/i.test(css)) element.textContent = sanitizeCss(css);
	});

	container.querySelectorAll("a[href]").forEach((anchor) => {
		const href = anchor.getAttribute("href") ?? "";
		if (href.startsWith("#")) return;

		const url = toUrl(href);
		if (!url || !SAFE_LINK_PROTOCOLS.has(url.protocol)) {
			anchor.removeAttribute("href");
			return;
		}

		anchor.setAttribute("href", url.href);
		anchor.setAttribute("target", "_blank");
		anchor.setAttribute("rel", "noopener noreferrer nofollow");
	});
}
