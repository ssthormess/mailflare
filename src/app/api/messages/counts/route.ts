import { and, count, eq, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { messages } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { recipientDomainMatchSql } from "@/lib/email/recipient-domain";
import { listSmartFolders } from "@/lib/smart-folders/service";
import { buildMessageCounts } from "./utils";
import { getMailboxAccessLevel, listAccessibleMailboxIds } from "@/lib/mailboxes/access";

export async function GET(request: Request) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const mailboxId = url.searchParams.get("mailboxId");
	const db = getDb(env);
	const conditions: SQL[] = [];

	if (mailboxId) {
		const access = await getMailboxAccessLevel(db, user, mailboxId);
		if (!access?.canRead) {
			return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
		}
		conditions.push(eq(messages.mailboxId, mailboxId));
	} else {
		const accessibleMailboxIds = await listAccessibleMailboxIds(db, user);
		if (accessibleMailboxIds.length > 0) {
			conditions.push(inArray(messages.mailboxId, accessibleMailboxIds));
		} else {
			conditions.push(eq(messages.userId, user.id));
		}
	}

	const rows = await db
		.select({
			mailboxId: messages.mailboxId,
			folderId: messages.folderId,
			direction: messages.direction,
			status: messages.status,
			read: messages.read,
			starred: messages.starred,
			snoozedUntil: messages.snoozedUntil,
			total: count(),
		})
		.from(messages)
		.where(and(...conditions))
		.groupBy(
			messages.mailboxId,
			messages.folderId,
			messages.direction,
			messages.status,
			messages.read,
			messages.starred,
			messages.snoozedUntil,
		);

	const counts = buildMessageCounts(rows);
	if (mailboxId) {
		const folders = await listSmartFolders(db, user, mailboxId);
		const smartFolderCounts: Record<string, { total: number; unread: number }> = {};
		for (const folder of folders) {
			const [row] = await db
				.select({
					total: count(),
					unread: sql<number>`coalesce(sum(case when ${messages.read} = 0 then 1 else 0 end), 0)`,
				})
				.from(messages)
				.where(
					and(
						eq(messages.mailboxId, folder.mailboxId),
						eq(messages.direction, "inbound"),
						recipientDomainMatchSql(folder.domain),
					),
				);
			smartFolderCounts[folder.id] = {
				total: Number(row?.total ?? 0),
				unread: Number(row?.unread ?? 0),
			};
		}
		counts.smartFolders = smartFolderCounts;
	}
	return NextResponse.json({ counts });
}
