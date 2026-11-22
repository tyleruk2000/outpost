CREATE TABLE `household_people` (
	`household_id` text NOT NULL,
	`person_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`household_id`, `person_id`)
);
--> statement-breakpoint
CREATE INDEX `household_people_person` ON `household_people` (`person_id`);--> statement-breakpoint
CREATE TABLE `household_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`name` text,
	`at` integer NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `household_positions_household_at` ON `household_positions` (`household_id`,`at`);--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`kind` text DEFAULT 'fixed' NOT NULL,
	`home_marker_id` text,
	`base_marker_id` text,
	`country` text,
	`here_lat` real,
	`here_lon` real,
	`here_name` text,
	`here_at` integer,
	`here_source` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `emergency_plans` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `event_log` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `garden_sowings` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `medical_sheets` ADD `household_id` text;--> statement-breakpoint
ALTER TABLE `power_plans` ADD `household_id` text;--> statement-breakpoint
ALTER TABLE `routine_checks` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `supply_items` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `supply_shopping` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
-- Written by hand: what was the one household becomes the first, id 'household', named "Home". Its home is the saved place with the home icon that was home until now (homePlaceOf: the first saved, by created_at then id).
INSERT INTO `households` (`id`, `name`, `position`, `kind`, `home_marker_id`, `created_at`, `updated_at`) VALUES ('household', 'Home', 0, 'fixed', (SELECT `id` FROM `markers` WHERE `icon` = 'home' ORDER BY `created_at`, `id` LIMIT 1), CAST(unixepoch('subsec') * 1000 AS INTEGER), CAST(unixepoch('subsec') * 1000 AS INTEGER));--> statement-breakpoint
-- Everyone who was in the household is in the first one, in the order they were in.
INSERT INTO `household_people` (`household_id`, `person_id`, `position`) SELECT 'household', `id`, ROW_NUMBER() OVER (ORDER BY `position`, `id`) - 1 FROM `supply_members`;--> statement-breakpoint
-- A medical sheet for nobody in particular (or for someone since taken out) belongs to the first household; a person's sheet goes with the person.
UPDATE `medical_sheets` SET `household_id` = 'household' WHERE `member_id` IS NULL OR `member_id` NOT IN (SELECT `id` FROM `supply_members`);
