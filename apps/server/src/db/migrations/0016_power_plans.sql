CREATE TABLE `power_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`system` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
