CREATE TABLE `contact_pages` (
	`contact_id` text NOT NULL,
	`note_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`contact_id`, `note_id`),
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_pages_note_idx` ON `contact_pages` (`note_id`);--> statement-breakpoint
CREATE TABLE `contact_tags` (
	`contact_id` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`contact_id`, `name`),
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_tags_name_idx` ON `contact_tags` (`name`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`uid` text NOT NULL,
	`kind` text DEFAULT 'person' NOT NULL,
	`display_name` text NOT NULL,
	`sort_key` text NOT NULL,
	`data` text NOT NULL,
	`search_text` text DEFAULT '' NOT NULL,
	`is_emergency` integer DEFAULT false NOT NULL,
	`marker_id` text,
	`extra` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_uid_idx` ON `contacts` (`uid`);--> statement-breakpoint
CREATE INDEX `contacts_sort_idx` ON `contacts` (`sort_key`);--> statement-breakpoint
CREATE INDEX `contacts_emergency_idx` ON `contacts` (`is_emergency`);