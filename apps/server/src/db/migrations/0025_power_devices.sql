CREATE TABLE `power_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`supply` text NOT NULL,
	`watts` real,
	`watt_hours` real,
	`receive_w` real,
	`transmit_w` real,
	`standby_w` real,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
