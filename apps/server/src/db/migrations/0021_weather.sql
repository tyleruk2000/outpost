CREATE TABLE `weather_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`place_id` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`valid_from` integer,
	`valid_until` integer,
	`bytes` integer NOT NULL,
	`sent` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weather_cache_kind_place_idx` ON `weather_cache` (`kind`,`place_id`);--> statement-breakpoint
CREATE TABLE `weather_places` (
	`id` text PRIMARY KEY NOT NULL,
	`marker_id` text,
	`name` text NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`region` text,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weather_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`taken_at` integer NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`station_hpa` real NOT NULL,
	`height_m` real NOT NULL,
	`sea_level_hpa` real NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`origin` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `weather_readings_taken_idx` ON `weather_readings` (`taken_at`);