CREATE TABLE `network_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`mac` text,
	`addresses` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`services` text NOT NULL,
	`open_ports` text NOT NULL,
	`is_self` integer DEFAULT false NOT NULL,
	`is_router` integer DEFAULT false NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `network_devices_key` ON `network_devices` (`key`);--> statement-breakpoint
CREATE TABLE `network_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`subnets` text NOT NULL,
	`found` integer NOT NULL,
	`named` integer NOT NULL,
	`packets` integer NOT NULL,
	`new_devices` integer NOT NULL,
	`gone_devices` integer NOT NULL
);
