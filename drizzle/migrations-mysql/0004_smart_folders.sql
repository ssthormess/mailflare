CREATE TABLE `smart_folders` (
	`id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`mailbox_id` varchar(191) NOT NULL,
	`name` longtext NOT NULL,
	`domain` varchar(191) NOT NULL,
	`created_at` bigint NOT NULL,
	CONSTRAINT `smart_folders_id` PRIMARY KEY(`id`),
	CONSTRAINT `smart_folders_mailbox_domain_idx` UNIQUE(`mailbox_id`,`domain`)
);
--> statement-breakpoint
ALTER TABLE `smart_folders` ADD CONSTRAINT `smart_folders_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `smart_folders` ADD CONSTRAINT `smart_folders_mailbox_id_mailboxes_id_fk` FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `smart_folders_mailbox_idx` ON `smart_folders` (`mailbox_id`);--> statement-breakpoint
CREATE INDEX `smart_folders_user_idx` ON `smart_folders` (`user_id`);
