CREATE TABLE `emergency_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`kind_text` text DEFAULT '' NOT NULL,
	`template_id` text,
	`emergency_number` text DEFAULT '999' NOT NULL,
	`review_every_days` integer,
	`body` text NOT NULL,
	`use` text NOT NULL,
	`reviewed_at` integer NOT NULL,
	`opened_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
