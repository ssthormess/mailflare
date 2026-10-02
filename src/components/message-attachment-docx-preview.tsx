"use client";

import { useEffect, useRef, useState } from "react";
import { FileWarning } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { authFetch } from "@/lib/auth/client";
import type { MessageAttachmentDocxPreviewProps } from "./message-attachment-docx-preview-types";
import { assertDocxWithinSizeLimits, sanitizeRenderedDocx } from "./message-attachment-docx-preview-utils";

export function MessageAttachmentDocxPreview({ previewUrl }: MessageAttachmentDocxPreviewProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const container = containerRef.current;
		if (!previewUrl || !container) return;

		let cancelled = false;
		setError("");
		setLoading(true);
		container.innerHTML = "";

		(async () => {
			try {
				const response = await authFetch(previewUrl);
				if (!response.ok) throw new Error("Could not load this attachment");

				const data = await response.arrayBuffer();
				if (cancelled) return;
				await assertDocxWithinSizeLimits(data);
				if (cancelled) return;

				const { renderAsync } = await import("docx-preview");
				if (cancelled) return;

				await renderAsync(data, container, container, {
					className: "docx",
					inWrapper: true,
					breakPages: true,
					ignoreLastRenderedPageBreak: true,
					renderHeaders: true,
					renderFooters: true,
					renderFootnotes: true,
					renderEndnotes: true,
					useBase64URL: true,
				});
				if (cancelled) return;

				sanitizeRenderedDocx(container);
				setLoading(false);
			} catch (caught) {
				if (cancelled) return;
				setError(caught instanceof Error ? caught.message : "Could not load this attachment");
				setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
			container.innerHTML = "";
		};
	}, [previewUrl]);

	return (
		<div className="relative h-full w-full overflow-auto bg-neutral-100">
			{error ? (
				<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
					<FileWarning className="h-10 w-10 text-neutral-400" />
					<p className="text-sm text-neutral-600">{error}</p>
				</div>
			) : (
				<>
					{loading && (
						<div className="space-y-3 bg-white p-5">
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-11/12" />
							<Skeleton className="h-4 w-4/5" />
						</div>
					)}
					<div ref={containerRef} />
				</>
			)}
		</div>
	);
}
