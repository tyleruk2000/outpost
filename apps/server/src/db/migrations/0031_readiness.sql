CREATE TABLE `event_log` (
	`id` text PRIMARY KEY NOT NULL,
	`happened_at` integer NOT NULL,
	`author` text NOT NULL,
	`text` text NOT NULL,
	`plan_id` text,
	`plan_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`edited_at` integer,
	`edited_by` text
);
--> statement-breakpoint
CREATE INDEX `event_log_happened` ON `event_log` (`happened_at`);--> statement-breakpoint
CREATE TABLE `offline_drills` (
	`id` text PRIMARY KEY NOT NULL,
	`by` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`answers` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roll_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`asked_by` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`message_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routine_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`every_days` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`link` text,
	`template_id` text,
	`last_done_at` integer,
	`last_done_by` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `board_messages` ADD `sent_at` integer;