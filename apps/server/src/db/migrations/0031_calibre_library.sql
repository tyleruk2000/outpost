CREATE TABLE `book_details` (
	`document_id` text PRIMARY KEY NOT NULL,
	`authors` text NOT NULL,
	`series` text,
	`series_index` real,
	`cover_ext` text,
	`calibre_uuid` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `calibre_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`location_id` text NOT NULL,
	`rel_path` text NOT NULL,
	`plan` text,
	`options` text,
	`report` text,
	`error` text,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
