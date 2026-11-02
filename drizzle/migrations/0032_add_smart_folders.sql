CREATE TABLE `smart_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `smart_folders_mailbox_domain_idx` ON `smart_folders` (`mailbox_id`,`domain`);
--> statement-breakpoint
CREATE INDEX `smart_folders_mailbox_idx` ON `smart_folders` (`mailbox_id`);
