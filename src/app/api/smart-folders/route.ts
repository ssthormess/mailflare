import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/cookies";
import { getEnv } from "@/lib/cloudflare";
import { createSmartFolder, listSmartFolders } from "@/lib/smart-folders/service";
import { smartFolderSchema } from "@/lib/validators";

export async function GET(request: Request) {
	const env = getEnv();
	const user = await requireUser(env, request);
	const mailboxId = new URL(request.url).searchParams.get("mailboxId");
	if (!mailboxId) return NextResponse.json({ smartFolders: [] });

	const db = getDb(env);
	const folders = await listSmartFolders(db, user, mailboxId);
	return NextResponse.json({
		smartFolders: folders.map((folder) => ({
			id: folder.id,
			mailboxId: folder.mailboxId,
			name: folder.name,
			domain: folder.domain,
		})),
	});
}

export async function POST(request: Request) {
	const env = getEnv();
	const user = await requireUser(env, request);
	const parsed = smartFolderSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	const result = await createSmartFolder(getDb(env), user, parsed.data);
	if ("error" in result) {
		return NextResponse.json({ error: result.error }, { status: result.status });
	}
	return NextResponse.json(result.folder);
}
