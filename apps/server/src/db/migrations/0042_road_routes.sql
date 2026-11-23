CREATE TABLE `road_networks` (
	`id` text PRIMARY KEY NOT NULL,
	`region_id` text,
	`name` text NOT NULL,
	`country` text,
	`data_date` text,
	`rel_path` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`nodes` integer NOT NULL,
	`edges` integer NOT NULL,
	`crossings` integer DEFAULT 0 NOT NULL,
	`source` text NOT NULL,
	`bbox` text,
	`extract` text NOT NULL,
	`stats` text,
	`built_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `road_routes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`from_to` text DEFAULT '' NOT NULL,
	`distance_m` real NOT NULL,
	`duration_s` real NOT NULL,
	`route` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
