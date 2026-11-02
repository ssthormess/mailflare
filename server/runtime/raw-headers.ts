export function addHeadersToRaw(raw: Buffer, headers: Record<string, string>): Buffer {
	const entries = Object.entries(headers);
	if (entries.length === 0) return raw;

	for (const [name, value] of entries) {
		if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\r\n]/.test(value)) {
			throw new Error("Invalid forwarded header");
		}
	}

	const crlfSeparator = Buffer.from("\r\n\r\n");
	const lfSeparator = Buffer.from("\n\n");
	const crlfIndex = raw.indexOf(crlfSeparator);
	const lfIndex = raw.indexOf(lfSeparator);
	const useCrlf = crlfIndex >= 0 && (lfIndex < 0 || crlfIndex <= lfIndex);
	const separator = useCrlf ? crlfSeparator : lfSeparator;
	const separatorIndex = useCrlf ? crlfIndex : lfIndex;
	if (separatorIndex < 0) throw new Error("Cannot add forwarded headers to a malformed message");

	const lineEnding = useCrlf ? "\r\n" : "\n";
	const added = `${lineEnding}${entries.map(([name, value]) => `${name}: ${value}`).join(lineEnding)}${lineEnding}${lineEnding}`;
	return Buffer.concat([
		raw.subarray(0, separatorIndex),
		Buffer.from(added, "utf8"),
		raw.subarray(separatorIndex + separator.length),
	]);
}

/** Rewrite the visible sender for relays that only permit verified From domains. */
export function rewriteForwardedFrom(raw: Buffer, verifiedFrom: string): Buffer {
	if (!verifiedFrom.trim() || /[\r\n]/.test(verifiedFrom)) throw new Error("Invalid forwarding sender");
	const crlfSeparator = Buffer.from("\r\n\r\n");
	const lfSeparator = Buffer.from("\n\n");
	const crlfIndex = raw.indexOf(crlfSeparator);
	const lfIndex = raw.indexOf(lfSeparator);
	const useCrlf = crlfIndex >= 0 && (lfIndex < 0 || crlfIndex <= lfIndex);
	const separator = useCrlf ? crlfSeparator : lfSeparator;
	const separatorIndex = useCrlf ? crlfIndex : lfIndex;
	if (separatorIndex < 0) throw new Error("Cannot rewrite sender on a malformed message");

	const lineEnding = useCrlf ? "\r\n" : "\n";
	const headerText = raw.subarray(0, separatorIndex).toString("utf8");
	const fromPattern = /(^|\r?\n)From:[^\r\n]*(?:(?:\r?\n)[ \t][^\r\n]*)*/i;
	const match = headerText.match(fromPattern);
	const originalFrom = match?.[0]
		.replace(/^\r?\n/, "")
		.replace(/\r?\n[ \t]+/g, " ")
		.replace(/^From:\s*/i, "")
		.replace(/[\x00-\x1f\x7f]/g, " ")
		.trim()
		.slice(0, 500);

	let rewrittenHeaders = match
		? headerText.replace(fromPattern, `${match[1]}From: ${verifiedFrom}`)
		: `${headerText}${lineEnding}From: ${verifiedFrom}`;
	if (originalFrom) rewrittenHeaders += `${lineEnding}X-Original-From: ${originalFrom}`;
	return Buffer.concat([
		Buffer.from(rewrittenHeaders, "utf8"),
		separator,
		raw.subarray(separatorIndex + separator.length),
	]);
}
