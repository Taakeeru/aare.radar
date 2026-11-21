CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `digest_readers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`lang` text DEFAULT 'en' NOT NULL,
	`fields` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `digest_readers_email_unique` ON `digest_readers` (`email`);