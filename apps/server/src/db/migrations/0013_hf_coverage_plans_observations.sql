CREATE TABLE `communication_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`stations` text NOT NULL,
	`date` text NOT NULL,
	`from_utc` integer NOT NULL,
	`to_utc` integer NOT NULL,
	`bands` text NOT NULL,
	`mode` text NOT NULL,
	`required_snr_db` real,
	`reference_bandwidth_hz` real,
	`solar` text NOT NULL,
	`links` text NOT NULL,
	`result_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `observation_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`adif_version` text DEFAULT '' NOT NULL,
	`program` text DEFAULT '' NOT NULL,
	`records` integer NOT NULL,
	`imported` integer NOT NULL,
	`duplicates` integer NOT NULL,
	`skipped` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `radio_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`frequency_mhz` real,
	`band` text DEFAULT '' NOT NULL,
	`mode` text DEFAULT '' NOT NULL,
	`outcome` text NOT NULL,
	`tx_call` text DEFAULT '' NOT NULL,
	`tx_lat` real,
	`tx_lon` real,
	`tx_from` text DEFAULT '' NOT NULL,
	`rx_call` text DEFAULT '' NOT NULL,
	`rx_lat` real,
	`rx_lon` real,
	`rx_from` text DEFAULT '' NOT NULL,
	`power_watts` real,
	`antenna` text DEFAULT '' NOT NULL,
	`report_sent` text DEFAULT '' NOT NULL,
	`report_received` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`import_id` text,
	`same_as` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `observation_imports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `radio_observations_at_idx` ON `radio_observations` (`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `radio_observations_same_idx` ON `radio_observations` (`same_as`);--> statement-breakpoint
CREATE INDEX `radio_observations_import_idx` ON `radio_observations` (`import_id`);