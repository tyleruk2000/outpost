CREATE TABLE `garden_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`last_frost` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `garden_sowings` (
	`id` text PRIMARY KEY NOT NULL,
	`crop_id` text,
	`name` text NOT NULL,
	`sown_on` text NOT NULL,
	`place` text DEFAULT '' NOT NULL,
	`amount` text DEFAULT '' NOT NULL,
	`planted_out_on` text,
	`harvested_on` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `garden_sowings_sown_on` ON `garden_sowings` (`sown_on`);