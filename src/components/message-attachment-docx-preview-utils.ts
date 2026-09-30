const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * A `.docx` is untrusted input. docx-preview builds the DOM programmatically, so document
 * content cannot inject scripts, but hyperlink relationships can still carry a non-web scheme
 * that runs on click. Strip anything that is not a plain web link and harden the rest.
 */
export function sanitizeRenderedDocx(container: HTMLElement): void {
	container.querySelectorAll("script, iframe, object, embed, form").forEach((node) => node.remove());

	container.querySelectorAll("a[href]").forEach((anchor) => {
		const href = anchor.getAttribute("href") ?? "";
		if (href.startsWith("#")) return;

		let url: URL | null = null;
		try {
			url = new URL(href, window.location.origin);
		} catch {
			url = null;
		}

		if (!url || !SAFE_LINK_PROTOCOLS.has(url.protocol)) {
			anchor.removeAttribute("href");
			return;
		}

		anchor.setAttribute("href", url.href);
		anchor.setAttribute("target", "_blank");
		anchor.setAttribute("rel", "noopener noreferrer nofollow");
	});
}
