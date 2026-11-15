CREATE TABLE `drive_baseline` (
	`kind` text NOT NULL,
	`item_id` text NOT NULL,
	`hash` text NOT NULL,
	`parent_id` text,
	`trashed` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`kind`, `item_id`)
);
--> statement-breakpoint
CREATE TABLE `drive_merge_actions` (
	`merge_id` text NOT NULL,
	`seq` integer NOT NULL,
	`item_key` text,
	`kind` text NOT NULL,
	`outcome` text NOT NULL,
	`title` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`drive_item_id` text,
	`home_item_id` text,
	`drive_hash` text,
	`home_hash` text,
	`undo` text,
	`undone_at` integer,
	`undo_message` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`merge_id`, `seq`),
	FOREIGN KEY (`merge_id`) REFERENCES `drive_merges`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `drive_merge_actions_item_idx` ON `drive_merge_actions` (`kind`,`drive_item_id`);--> statement-breakpoint
CREATE TABLE `drive_merges` (
	`id` text PRIMARY KEY NOT NULL,
	`drive_id` text NOT NULL,
	`drive_written_at` integer DEFAULT 0 NOT NULL,
	`drive_path` text NOT NULL,
	`source_folder` text NOT NULL,
	`drive_label` text NOT NULL,
	`state` text NOT NULL,
	`baseline` text,
	`analysis` text,
	`choices` text,
	`error` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`undone_at` integer
);
--> statement-breakpoint
CREATE INDEX `drive_merges_drive_idx` ON `drive_merges` (`drive_id`,`drive_written_at`);--> statement-breakpoint
CREATE TABLE `library_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
