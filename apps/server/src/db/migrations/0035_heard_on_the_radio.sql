CREATE TABLE `heard_range_tests` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`receiver_id` text,
	`station_id` text,
	`from_at` integer NOT NULL,
	`to_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `heard_receivers` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`transport` text DEFAULT 'tcp' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `heard_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`station_id` text NOT NULL,
	`receiver_id` text,
	`at` integer NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`altitude` real,
	`direct` integer DEFAULT true NOT NULL,
	`via` text,
	`snr` real,
	`rssi` real,
	`hops` integer
);
--> statement-breakpoint
CREATE INDEX `heard_reports_station_idx` ON `heard_reports` (`station_id`,`at`);--> statement-breakpoint
CREATE INDEX `heard_reports_receiver_idx` ON `heard_reports` (`receiver_id`,`at`);--> statement-breakpoint
CREATE INDEX `heard_reports_at_idx` ON `heard_reports` (`at`);--> statement-breakpoint
CREATE TABLE `heard_stations` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`kind_words` text,
	`symbol` text,
	`receiver_id` text,
	`lat` real,
	`lon` real,
	`altitude` real,
	`course` real,
	`speed` real,
	`comment` text,
	`direct` integer DEFAULT true NOT NULL,
	`via` text,
	`details` text NOT NULL,
	`first_at` integer NOT NULL,
	`last_at` integer NOT NULL,
	`position_at` integer,
	`reports` integer DEFAULT 0 NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`pin_name` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `heard_stations_key_idx` ON `heard_stations` (`source`,`key`);--> statement-breakpoint
CREATE INDEX `heard_stations_last_idx` ON `heard_stations` (`last_at`);