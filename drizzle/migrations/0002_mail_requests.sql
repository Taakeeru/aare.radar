CREATE TABLE `mail_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`lang` text DEFAULT 'en' NOT NULL,
	`fields` text,
	`canton` text,
	`subscribe` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
CREATE INDEX `mail_requests_status_idx` ON `mail_requests` (`status`);
