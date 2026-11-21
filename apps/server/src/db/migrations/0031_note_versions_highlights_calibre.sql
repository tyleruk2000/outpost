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
--> statement-breakpoint
CREATE TABLE `document_highlights` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`page` integer,
	`chapter` integer,
	`exact` text NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`suffix` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_highlights_document_idx` ON `document_highlights` (`document_id`,`page`,`chapter`);--> statement-breakpoint
CREATE TABLE `note_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`content` text NOT NULL,
	`encrypted` integer DEFAULT false NOT NULL,
	`saved_at` integer NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_versions_note_idx` ON `note_versions` (`note_id`,`saved_at`);