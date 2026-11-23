CREATE TABLE `country_files` (
	`id` text PRIMARY KEY NOT NULL,
	`region_id` text NOT NULL,
	`name` text NOT NULL,
	`country` text,
	`data_date` text,
	`file_name` text NOT NULL,
	`source_url` text NOT NULL,
	`bytes` integer NOT NULL,
	`collection_id` text,
	`road_network_id` text,
	`pack_id` text,
	`read_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `country_files_region_idx` ON `country_files` (`region_id`);