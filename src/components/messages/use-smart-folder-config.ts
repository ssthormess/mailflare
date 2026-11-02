"use client";

import { AtSign } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { authFetch } from "@/lib/auth/client";
import type { MessageFolderConfig } from "./types";

type SmartFolderSummary = {
	id: string;
	name: string;
	domain: string;
};

export function useSmartFolderConfig(smartFolderId: string): MessageFolderConfig {
	const { selectedMailbox } = useSelectedMailbox();
	const [folderName, setFolderName] = useState("Smart folder");

	useEffect(() => {
		if (!selectedMailbox?.id) return;
		let cancelled = false;
		const search = new URLSearchParams({ mailboxId: selectedMailbox.id });

		authFetch(`/api/smart-folders?${search.toString()}`)
			.then((response) => response.json() as Promise<{ smartFolders?: SmartFolderSummary[] }>)
			.then((data) => {
				if (cancelled) return;
				const folder = data.smartFolders?.find((item) => item.id === smartFolderId);
				if (folder) setFolderName(folder.name);
			})
			.catch(() => {});

		return () => {
			cancelled = true;
		};
	}, [smartFolderId, selectedMailbox?.id]);

	return useMemo(
		() => ({
			folder: "inbox",
			smartFolderId,
			title: folderName,
			emptyText: `No mail received on ${folderName}`,
			hrefPrefix: `/smart-folders/${smartFolderId}`,
			icon: AtSign,
			showRowBadge: false,
		}),
		[folderName, smartFolderId],
	);
}
