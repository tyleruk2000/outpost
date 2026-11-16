CREATE TABLE `morse_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`koch_lesson` integer DEFAULT 1 NOT NULL,
	`best_char_wpm` real,
	`best_eff_wpm` real,
	`settings` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `morse_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`at` integer NOT NULL,
	`accuracy` real NOT NULL,
	`char_wpm` real,
	`eff_wpm` real,
	`rhythm` real,
	`lesson` integer,
	`misses` text NOT NULL,
	`tries` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `morse_sessions_at_idx` ON `morse_sessions` (`at`);