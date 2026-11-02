import { and, asc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db";
import { smartFolders } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/types";
import { normalizeRecipientDomain } from "@/lib/email/recipient-domain";
import { newId } from "@/lib/ids";
import { getMailboxAccessLevel } from "@/lib/mailboxes/access";

export async function listSmartFolders(db: AppDatabase, user: Pick<SessionUser, "id" | "role">, mailboxId: string) {
	const access = await getMailboxAccessLevel(db, user, mailboxId);
	if (!access?.canRead) return [];
	return db.select().from(smartFolders).where(eq(smartFolders.mailboxId, mailboxId)).orderBy(asc(smartFolders.name));
}

export async function getReadableSmartFolder(db: AppDatabase, user: Pick<SessionUser, "id" | "role">, smartFolderId: string) {
	const [folder] = await db.select().from(smartFolders).where(eq(smartFolders.id, smartFolderId)).limit(1);
	if (!folder) return null;
	const access = await getMailboxAccessLevel(db, user, folder.mailboxId);
	if (!access?.canRead) return null;
	return folder;
}

export async function createSmartFolder(
	db: AppDatabase,
	user: Pick<SessionUser, "id" | "role">,
	input: { mailboxId: string; domain: string; name?: string },
) {
	const access = await getMailboxAccessLevel(db, user, input.mailboxId);
	if (!access?.canManage) return { error: "Mailbox not found" as const, status: 404 as const };
	const domain = normalizeRecipientDomain(input.domain);
	if (!domain) return { error: "Enter a domain like panorama.onl" as const, status: 400 as const };

	const name = (input.name?.trim() || domain).slice(0, 80);
	const [existing] = await db
		.select({ id: smartFolders.id })
		.from(smartFolders)
		.where(and(eq(smartFolders.mailboxId, input.mailboxId), eq(smartFolders.domain, domain)))
		.limit(1);
	if (existing) return { error: "A smart folder for that domain already exists" as const, status: 409 as const };

	const id = newId("smf");
	await db.insert(smartFolders).values({
		id,
		userId: access.mailbox.userId,
		mailboxId: access.mailbox.id,
		name,
		domain,
	});
	return { folder: { id, mailboxId: access.mailbox.id, name, domain } };
}
