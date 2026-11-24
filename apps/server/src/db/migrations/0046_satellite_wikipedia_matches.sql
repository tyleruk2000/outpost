CREATE TABLE `satellite_wikipedia_discarded` (
	`norad_id` integer NOT NULL,
	`title` text NOT NULL,
	`discarded_at` integer NOT NULL,
	PRIMARY KEY(`norad_id`, `title`)
);
--> statement-breakpoint
ALTER TABLE `satellite_wikipedia` ADD `wikidata_id` text;--> statement-breakpoint
ALTER TABLE `satellite_wikipedia` ADD `archive_collection_id` text;--> statement-breakpoint
ALTER TABLE `satellite_wikipedia` ADD `archive_title` text;--> statement-breakpoint
ALTER TABLE `satellite_wikipedia` ADD `archive_date` text;