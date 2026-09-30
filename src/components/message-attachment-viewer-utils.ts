import type { MessageAttachment } from "@/app/(dashboard)/inbox/[messageId]/types";
import type { AttachmentPreviewKind } from "./message-attachment-viewer-types";

export function getAttachmentFileUrl(
	messageId: string,
	attachmentId: string,
	mode: "download" | "preview" = "download",
): string {
	const suffix = mode === "preview" ? "?preview=1" : "?download=1";
	return `/api/messages/${messageId}/attachments/${attachmentId}${suffix}`;
}

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function isDocxAttachment(
	attachment: Pick<MessageAttachment, "filename" | "type">,
): boolean {
	return attachment.type === DOCX_MIME_TYPE || attachment.filename.toLowerCase().endsWith(".docx");
}

export function getAttachmentPreviewKind(
	attachment: Pick<MessageAttachment, "filename" | "type">,
): AttachmentPreviewKind {
	if (attachment.type === "application/pdf") return "pdf";
	if (attachment.type.startsWith("audio/")) return "audio";
	if (attachment.type.startsWith("video/")) return "video";
	if (attachment.type.startsWith("image/") && attachment.type !== "image/svg+xml") return "image";
	if (isDocxAttachment(attachment)) return "docx";
	if (
		attachment.type.startsWith("text/plain") ||
		attachment.type === "application/json" ||
		attachment.type === "application/xml" ||
		attachment.type === "text/csv"
	) {
		return "text";
	}
	return "unsupported";
}
