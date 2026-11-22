CREATE TABLE `satellite_about` (
	`norad_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`other_names` text NOT NULL,
	`status` text NOT NULL,
	`launched` text,
	`deployed` text,
	`decayed` text,
	`website` text,
	`operator` text,
	`countries` text NOT NULL,
	`citation` text,
	`frequency_violator` integer DEFAULT false NOT NULL,
	`associated` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `satellite_wikipedia` (
	`norad_id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`description` text,
	`extract` text NOT NULL,
	`found_by` text NOT NULL,
	`searched_for` text NOT NULL,
	`edited_at` text,
	`fetched_at` integer NOT NULL
);
