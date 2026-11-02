"use client";

import { useParams } from "next/navigation";
import { MessageFolderPage } from "@/components/messages/message-folder-page";
import { useSmartFolderConfig } from "@/components/messages/use-smart-folder-config";

export default function SmartFolderPage() {
	const params = useParams<{ smartFolderId: string }>();
	const config = useSmartFolderConfig(params.smartFolderId);

	return <MessageFolderPage config={config} />;
}
