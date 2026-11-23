CREATE TABLE `job_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`state` text NOT NULL,
	`message` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_events_job_idx` ON `job_events` (`job_id`,`id`);--> statement-breakpoint
CREATE TABLE `job_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`at` integer NOT NULL,
	`current` integer NOT NULL,
	`total` integer,
	`unit` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_samples_job_idx` ON `job_samples` (`job_id`,`at`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `progress_unit` text;