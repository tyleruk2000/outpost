CREATE TABLE `antenna_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`height_m` real DEFAULT 0 NOT NULL,
	`ground` text DEFAULT 'average' NOT NULL,
	`broadside_deg` real,
	`gain_db` real DEFAULT 0 NOT NULL,
	`feedline_loss_db` real DEFAULT 0 NOT NULL,
	`min_mhz` real NOT NULL,
	`max_mhz` real NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `propagation_results` (
	`key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`engine` text NOT NULL,
	`request` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `propagation_results_used_idx` ON `propagation_results` (`last_used_at`);--> statement-breakpoint
CREATE TABLE `propagation_saved` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'point' NOT NULL,
	`request` text NOT NULL,
	`result_key` text,
	`note_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `radio_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`power_watts` real NOT NULL,
	`min_mhz` real NOT NULL,
	`max_mhz` real NOT NULL,
	`modes` text NOT NULL,
	`receiver` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
