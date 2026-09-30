import { newId } from "@/lib/ids";
import type { AttachmentContent } from "@/lib/email/attachment-types";

export type PostalSendInput = {
	from: string;
	to: string[];
	cc: string[];
	bcc: string[];
	subject: string;
	html?: string;
	text?: string;
	headers: Record<string, string>;
	attachments: AttachmentContent[];
};

const BASE64_CHUNK = 0x8000;

function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
	}
	return btoa(binary);
}

/**
 * Sends through a self-hosted Postal server's HTTP API instead of the
 * Cloudflare send_email binding. Returns the RFC Message-ID we assign, so
 * threading behaves the same as the provider-generated id path.
 */
export async function sendViaPostal(
	env: Pick<CloudflareEnv, "POSTAL_API_URL" | "POSTAL_API_KEY">,
	input: PostalSendInput,
): Promise<{ messageId: string }> {
	const baseUrl = (env.POSTAL_API_URL ?? "").trim().replace(/\/+$/, "");
	const apiKey = (env.POSTAL_API_KEY ?? "").trim();
	if (!baseUrl || !apiKey) throw new Error("Postal transport is not configured");

	const domain = input.from.split("@").pop() ?? "localhost";
	const messageId = `${newId("m")}@${domain}`;

	const response = await fetch(`${baseUrl}/api/v1/send/message`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Server-API-Key": apiKey,
		},
		body: JSON.stringify({
			to: input.to,
			cc: input.cc.length ? input.cc : undefined,
			bcc: input.bcc.length ? input.bcc : undefined,
			from: input.from,
			sender: input.from,
			subject: input.subject,
			plain_body: input.text,
			html_body: input.html,
			headers: { ...input.headers, "Message-ID": `<${messageId}>` },
			attachments: input.attachments.length
				? input.attachments.map((attachment) => ({
						name: attachment.filename,
						content_type: attachment.type,
						data: toBase64(attachment.content),
					}))
				: undefined,
		}),
	});
	const data = (await response.json().catch(() => null)) as {
		status?: string;
		message?: string;
	} | null;
	if (!response.ok || !data || data.status !== "success") {
		const detail = data ? JSON.stringify(data).slice(0, 300) : "no body";
		throw new Error(`Postal send failed (${response.status}): ${detail}`);
	}
	return { messageId };
}

export function isPostalConfigured(
	env: Pick<CloudflareEnv, "POSTAL_API_URL" | "POSTAL_API_KEY">,
): boolean {
	return !!(env.POSTAL_API_URL?.trim() && env.POSTAL_API_KEY?.trim());
}
