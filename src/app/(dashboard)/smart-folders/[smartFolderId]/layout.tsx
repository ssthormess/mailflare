"use client";

import { useParams } from "next/navigation";
import { MessageSplitLayout } from "@/components/messages/message-split-layout";
import { useSmartFolderConfig } from "@/components/messages/use-smart-folder-config";

export default function SmartFolderLayout({ children }: { children: React.ReactNode }) {
	const params = useParams<{ smartFolderId: string }>();
	const config = useSmartFolderConfig(params.smartFolderId);

	return <MessageSplitLayout config={config}>{children}</MessageSplitLayout>;
}
