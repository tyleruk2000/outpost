CREATE TABLE `network_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`server` text NOT NULL,
	`port` integer DEFAULT 445 NOT NULL,
	`share` text NOT NULL,
	`user_name` text NOT NULL,
	`password_in_keychain` integer DEFAULT false NOT NULL,
	`auto_connect` integer DEFAULT true NOT NULL,
	`mount_path` text,
	`last_address` text,
	`last_error` text,
	`last_connected_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `network_shares_address_idx` ON `network_shares` (`server`,`port`,`share`);