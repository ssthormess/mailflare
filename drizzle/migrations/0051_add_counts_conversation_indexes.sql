-- Folder counts and conversation paging on large mailboxes. The counts
-- endpoint groups by (mailbox, folder, direction, status, read, starred,
-- snoozed_until); without a covering index that means a temp b-tree over
-- every row. The conversation pager filters on snoozed_until too, so it
-- rides the same tail column.
CREATE INDEX IF NOT EXISTS `messages_counts_cover_idx` ON `messages` (`mailbox_id`, `folder_id`, `direction`, `status`, `read`, `starred`, `snoozed_until`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `messages_conv_cover_idx` ON `messages` (`mailbox_id`, `status`, `folder_id`, coalesce(`thread_id`, `id`), `created_at`, `snoozed_until`);
