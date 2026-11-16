CREATE TABLE `repeater_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`source_url` text,
	`format` text NOT NULL,
	`mapping` text,
	`file_name` text,
	`data_date` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `repeaters` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text,
	`source_key` text,
	`callsign` text NOT NULL,
	`output_hz` integer NOT NULL,
	`input_hz` integer,
	`band` text NOT NULL,
	`modes` text DEFAULT ',' NOT NULL,
	`ctcss_hz` real,
	`dcs_code` text,
	`dmr_colour_code` integer,
	`talkgroups` text DEFAULT '' NOT NULL,
	`access_note` text DEFAULT '' NOT NULL,
	`channel` text DEFAULT '' NOT NULL,
	`place` text DEFAULT '' NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`lat` real,
	`lon` real,
	`locator` text DEFAULT '' NOT NULL,
	`position_precision_m` integer,
	`antenna_m` real,
	`keeper` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`status_text` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`search_text` text DEFAULT '' NOT NULL,
	`source_row` text,
	`edited_at` integer,
	`removed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `repeater_lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `repeaters_list_idx` ON `repeaters` (`list_id`,`source_key`);--> statement-breakpoint
CREATE INDEX `repeaters_position_idx` ON `repeaters` (`lat`,`lon`,`removed_at`,`id`);--> statement-breakpoint
CREATE INDEX `repeaters_output_idx` ON `repeaters` (`output_hz`);--> statement-breakpoint
CREATE INDEX `repeaters_callsign_idx` ON `repeaters` ("callsign" COLLATE NOCASE);--> statement-breakpoint
CREATE INDEX `repeaters_search_idx` ON `repeaters` (`search_text`,`removed_at`,`output_hz`,`input_hz`,`id`);