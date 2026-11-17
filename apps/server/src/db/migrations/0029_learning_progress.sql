CREATE TABLE `learning_days` (
	`learner` text NOT NULL,
	`archive` text NOT NULL,
	`day` text NOT NULL,
	`seconds` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`learner`, `archive`, `day`)
);
--> statement-breakpoint
CREATE TABLE `learning_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`learner` text NOT NULL,
	`archive` text NOT NULL,
	`archive_title` text NOT NULL,
	`path` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`first_opened_at` integer NOT NULL,
	`last_opened_at` integer NOT NULL,
	`seconds_in_view` integer DEFAULT 0 NOT NULL,
	`done_at` integer,
	`done_how` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_pages_page_idx` ON `learning_pages` (`learner`,`archive`,`path`);--> statement-breakpoint
CREATE INDEX `learning_pages_recent_idx` ON `learning_pages` (`learner`,`archive`,`updated_at`);--> statement-breakpoint
CREATE TABLE `learning_topics` (
	`archive` text NOT NULL,
	`path` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`links` text NOT NULL,
	`is_home` integer DEFAULT false NOT NULL,
	`seen_at` integer NOT NULL,
	PRIMARY KEY(`archive`, `path`)
);
