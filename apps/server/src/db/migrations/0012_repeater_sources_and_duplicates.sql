ALTER TABLE `repeater_lists` ADD `fetched` text;--> statement-breakpoint
ALTER TABLE `repeaters` ADD `merged_into` text;--> statement-breakpoint
CREATE INDEX `repeaters_merged_idx` ON `repeaters` (`merged_into`);