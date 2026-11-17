CREATE TABLE `board_files` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`rel_path` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`gone_at` integer,
	`gone_reason` text
);
--> statement-breakpoint
CREATE INDEX `board_files_expires` ON `board_files` (`expires_at`);--> statement-breakpoint
CREATE TABLE `board_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`source` text NOT NULL,
	`external_id` text,
	`kind` text NOT NULL,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`status` text,
	`place` text,
	`lat` real,
	`lon` real,
	`accuracy_m` real,
	`file_id` text,
	`meta` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`edited_at` integer,
	`edited_by` text,
	`removed_at` integer,
	`removed_by` text,
	FOREIGN KEY (`file_id`) REFERENCES `board_files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `board_messages_channel_created` ON `board_messages` (`channel`,`created_at`);--> statement-breakpoint
CREATE INDEX `board_messages_author_kind` ON `board_messages` (`kind`,`author`);--> statement-breakpoint
CREATE UNIQUE INDEX `board_messages_external` ON `board_messages` (`source`,`external_id`);