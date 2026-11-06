import { sql, type SQL } from "drizzle-orm";
import { schemaDialect } from "@/db/dialect";
import { matchNothing } from "@/db/sql";
import { messages } from "@/db/schema";
import { getEmailAddressList } from "@/lib/email/address";

const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const BOUNDARIES = ["", ">", ",", ";", " ", "\t", "\n", "\r"];

/** Hostname only. Rejects a missing dot, a leading dot, and anything that is not a domain. */
export function normalizeRecipientDomain(value: string): string | null {
	const domain = value.trim().toLowerCase().replace(/\.+$/, "");
	if (!DOMAIN_RE.test(domain)) return null;
	return domain;
}

/** To/Cc address is exactly this domain, or a subdomain of it. */
export function headerMatchesRecipientDomain(header: string | null | undefined, domain: string): boolean {
	const normalized = normalizeRecipientDomain(domain);
	if (!normalized) return false;
	return getEmailAddressList(header).some((address) => {
		const host = address.slice(address.lastIndexOf("@") + 1);
		return host === normalized || host.endsWith(`.${normalized}`);
	});
}

/** FTS5 phrase over the recipient columns. Dots become token breaks, so this is a candidate filter only. */
export function recipientDomainFtsQuery(domain: string): string | null {
	const normalized = normalizeRecipientDomain(domain);
	if (!normalized) return null;
	const tokens = normalized.split(/[.-]+/).filter(Boolean);
	if (tokens.length < 2) return null;
	return `{to_addr cc_addr} : "${tokens.join(" ")}"`;
}

/**
 * LIKE patterns for `@domain` and `.domain` (subdomains) stopped at a header
 * boundary, so `panorama.com.ve` and `notpanorama.onl` do not match `panorama.onl`.
 */
export function recipientDomainLikePatterns(domain: string): string[] {
	const normalized = normalizeRecipientDomain(domain);
	if (!normalized) return [];
	const needles = [`@${normalized}`, `.${normalized}`];
	const patterns: string[] = [];
	for (const needle of needles) {
		for (const boundary of BOUNDARIES) {
			patterns.push(boundary === "" ? `%${needle}` : `%${needle}${boundary}%`);
		}
	}
	return patterns;
}

/**
 * Indexed candidate set (SQLite's FTS5), then an exact domain check. Both sides
 * are required. Other dialects have no messages_fts or rowid, so — like
 * buildSearchConditions — they run the boundary-safe LIKE patterns alone.
 */
export function recipientDomainMatchSql(domain: string): SQL {
	const patterns = recipientDomainLikePatterns(domain);
	if (patterns.length === 0) return matchNothing;
	const likeCondition = sql.join(
		patterns.flatMap((pattern) => [
			sql`lower(${messages.toAddr}) like ${pattern}`,
			sql`lower(coalesce(${messages.ccAddr}, '')) like ${pattern}`,
		]),
		sql` or `,
	);
	if (schemaDialect() !== "sqlite") return sql`(${likeCondition})`;
	const fts = recipientDomainFtsQuery(domain);
	if (!fts) return sql`(${likeCondition})`;
	return sql`(${messages}.rowid in (select rowid from messages_fts where messages_fts match ${fts}) and (${likeCondition}))`;
}
