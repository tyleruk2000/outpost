CREATE TABLE `nuclear_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`effects` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
