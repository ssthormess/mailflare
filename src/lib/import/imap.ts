import type { ImportMessageInput } from "./types";
import type { ImapImportInput } from "./imap-types";
import {
	assertSafeImapHost,
	getLiteralLength,
	isTaggedCompletion,
	parseListMailboxName,
	parseSearchUids,
	quoteImapString,
} from "./imap-utils";

type CloudflareSocketConnect = (
	address: { hostname: string; port: number },
	options: { secureTransport: "on" | "off"; allowHalfOpen: boolean },
) => Socket;

async function getCloudflareSocketConnect(): Promise<CloudflareSocketConnect> {
	try {
		const moduleName = "cloudflare:sockets";
		const sockets = await import(
			/* webpackIgnore: true */
			/* @vite-ignore */
			moduleName
		) as { connect: CloudflareSocketConnect };
		return sockets.connect;
	} catch {
		// Self-hosted (node) runtime: wrap a net/tls socket as a CF-style Socket.
		const tls = await import("node:tls");
		const net = await import("node:net");
		const { Readable, Writable } = await import("node:stream");
		return (address, options) => {
			const raw = options.secureTransport === "on"
				? tls.connect({ host: address.hostname, port: address.port, servername: address.hostname })
				: net.connect({ host: address.hostname, port: address.port });
			return {
				readable: Readable.toWeb(raw) as ReadableStream<Uint8Array>,
				writable: Writable.toWeb(raw) as WritableStream<Uint8Array>,
				close: () => raw.destroy(),
				closed: Promise.resolve(),
			} as unknown as Socket;
		};
	}
}

class ImapConnection {
	private reader: ReadableStreamDefaultReader<Uint8Array>;
	private writer: WritableStreamDefaultWriter<Uint8Array>;
	private decoder = new TextDecoder();
	private encoder = new TextEncoder();
	private buffer = new Uint8Array();
	private scanIndex = 0;
	private tagCounter = 0;

	constructor(socket: Socket) {
		this.reader = socket.readable.getReader();
		this.writer = socket.writable.getWriter();
	}

	async close(): Promise<void> {
		try {
			await this.writer.close();
		} catch {
			// Socket may already be closed by the server.
		}
	}

	async readGreeting(): Promise<void> {
		const line = await this.readLine();
		if (!line.startsWith("* OK")) throw new Error("IMAP server did not send an OK greeting");
	}

	async command(command: string): Promise<string[]> {
		const tag = this.nextTag();
		await this.write(`${tag} ${command}\r\n`);
		const lines: string[] = [];
		while (true) {
			const line = await this.readLine();
			lines.push(line);
			if (isTaggedCompletion(line, tag)) {
				if (!line.toUpperCase().includes(" OK")) {
					throw new Error(`IMAP command failed: ${line}`);
				}
				return lines;
			}
		}
	}

	async fetchMessage(uid: string): Promise<ArrayBuffer> {
		const tag = this.nextTag();
		await this.write(`${tag} UID FETCH ${uid} (RFC822)\r\n`);
		let raw: ArrayBuffer | null = null;

		while (true) {
			const line = await this.readLine();
			const literalLength = getLiteralLength(line);
			if (literalLength !== null) {
				raw = await this.readBytes(literalLength);
				continue;
			}
			if (isTaggedCompletion(line, tag)) {
				if (!line.toUpperCase().includes(" OK")) {
					throw new Error(`IMAP fetch failed: ${line}`);
				}
				if (!raw) throw new Error("IMAP fetch returned no message");
				return raw;
			}
		}
	}

	private nextTag(): string {
		this.tagCounter += 1;
		return `A${String(this.tagCounter).padStart(4, "0")}`;
	}

	private async write(value: string): Promise<void> {
		await this.writer.write(this.encoder.encode(value));
	}

	private async readLine(): Promise<string> {
		while (true) {
			const index = findCrlf(this.buffer, this.scanIndex);
			if (index >= 0) {
				const lineBytes = this.buffer.slice(0, index);
				this.buffer = this.buffer.slice(index + 2);
				this.scanIndex = 0;
				return this.decoder.decode(lineBytes);
			}
			this.scanIndex = Math.max(0, this.buffer.byteLength - 1);
			await this.readMore();
		}
	}

	private async readBytes(length: number): Promise<ArrayBuffer> {
		while (this.buffer.byteLength < length) {
			await this.readMore();
		}
		const bytes = this.buffer.slice(0, length);
		this.buffer = this.buffer.slice(length);
		this.scanIndex = Math.min(this.scanIndex, this.buffer.byteLength);
		return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
	}

	private async readMore(): Promise<void> {
		const { value, done } = await this.reader.read();
		if (done || !value) throw new Error("IMAP connection closed unexpectedly");
		const next = new Uint8Array(this.buffer.byteLength + value.byteLength);
		next.set(this.buffer);
		next.set(value, this.buffer.byteLength);
		this.buffer = next;
	}
}

function findCrlf(buffer: Uint8Array, fromIndex = 0): number {
	for (let index = fromIndex; index < buffer.byteLength - 1; index += 1) {
		if (buffer[index] === 13 && buffer[index + 1] === 10) return index;
	}
	return -1;
}

export async function fetchImapMessages(
	input: ImapImportInput,
): Promise<{ messages: ImportMessageInput[]; nextBeforeUid?: number }> {
	assertSafeImapHost(input.host);
	const connect = await getCloudflareSocketConnect();
	const socket = connect(
		{ hostname: input.host, port: input.port },
		{ secureTransport: input.secure ? "on" : "off", allowHalfOpen: false },
	);
	const imap = new ImapConnection(socket);
	try {
		await imap.readGreeting();
		await imap.command(`LOGIN ${quoteImapString(input.username)} ${quoteImapString(input.password)}`);
		await imap.command(`SELECT ${quoteImapString(input.folder)}`);
		const searchLines = await imap.command("UID SEARCH ALL");
		const allUids = searchLines
			.flatMap(parseSearchUids)
			.map(Number)
			.sort((a, b) => a - b);
		const eligible = input.beforeUid ? allUids.filter((uid) => uid < input.beforeUid) : allUids;
		const uids = eligible.slice(-input.limit);
		const messages: ImportMessageInput[] = [];
		for (const uid of uids) {
			messages.push({
				filename: `${input.folder}-${uid}.eml`,
				raw: await imap.fetchMessage(uid),
			});
		}
		await imap.command("LOGOUT").catch(() => undefined);
		return { messages, nextBeforeUid: uids.length ? uids[0] : undefined };
	} finally {
		await imap.close();
	}
}

export async function listImapFolders(input: Omit<ImapImportInput, "folder" | "limit">): Promise<string[]> {
	assertSafeImapHost(input.host);
	const connect = await getCloudflareSocketConnect();
	const socket = connect(
		{ hostname: input.host, port: input.port },
		{ secureTransport: input.secure ? "on" : "off", allowHalfOpen: false },
	);
	const imap = new ImapConnection(socket);
	try {
		await imap.readGreeting();
		await imap.command(`LOGIN ${quoteImapString(input.username)} ${quoteImapString(input.password)}`);
		const lines = await imap.command('LIST "" "*"');
		await imap.command("LOGOUT").catch(() => undefined);
		return Array.from(new Set(lines.map(parseListMailboxName).filter((name): name is string => !!name)));
	} finally {
		await imap.close();
	}
}
