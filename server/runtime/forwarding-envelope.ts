/**
 * Choose the SMTP envelope sender used for raw forwards.
 * The original message headers remain untouched; relays can use a verified
 * sender domain for bounce handling and sender-policy validation.
 */
export function resolveForwardingEnvelopeFrom(source: string, configured?: string): string {
	const override = configured?.trim();
	return override || source;
}
