CREATE TABLE `satellite_elements` (
	`norad_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`designator` text,
	`epoch` integer NOT NULL,
	`elements` text NOT NULL,
	`groups` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `satellite_fetches` (
	`source` text PRIMARY KEY NOT NULL,
	`fetched_at` integer,
	`count` integer DEFAULT 0 NOT NULL,
	`error` text,
	`tried_at` integer
);
--> statement-breakpoint
CREATE TABLE `satellite_transmitters` (
	`id` text PRIMARY KEY NOT NULL,
	`norad_id` integer NOT NULL,
	`description` text NOT NULL,
	`alive` integer NOT NULL,
	`status` text NOT NULL,
	`type` text,
	`mode` text,
	`uplink_low_hz` integer,
	`uplink_high_hz` integer,
	`downlink_low_hz` integer,
	`downlink_high_hz` integer,
	`invert` integer DEFAULT false NOT NULL,
	`baud` real,
	`updated_at` text
);
--> statement-breakpoint
CREATE INDEX `satellite_transmitters_norad_idx` ON `satellite_transmitters` (`norad_id`);