CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`rel_path` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attachments_note_idx` ON `attachments` (`note_id`);--> statement-breakpoint
CREATE TABLE `catalog_cache` (
	`entry_id` text PRIMARY KEY NOT NULL,
	`resolved` text NOT NULL,
	`resolved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_row_id` integer NOT NULL,
	`ordinal` integer NOT NULL,
	`title` text NOT NULL,
	`tags` text DEFAULT '' NOT NULL,
	`heading` text DEFAULT '' NOT NULL,
	`text` text NOT NULL,
	`page` integer,
	`char_start` integer,
	`char_end` integer,
	`content_hash` text NOT NULL,
	`index_version` integer NOT NULL,
	FOREIGN KEY (`entity_row_id`) REFERENCES `search_entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chunks_entity_idx` ON `chunks` (`entity_row_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `chunks_hash_idx` ON `chunks` (`content_hash`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`catalog_entry_id` text,
	`title` text NOT NULL,
	`description` text,
	`category` text,
	`language` text,
	`publisher` text,
	`license` text,
	`attribution` text,
	`version` text,
	`location_id` text NOT NULL,
	`rel_path` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`sha256` text,
	`status` text DEFAULT 'installed' NOT NULL,
	`meta` text NOT NULL,
	`installed_at` integer NOT NULL,
	`verified_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `storage_locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `collections_kind_idx` ON `collections` (`kind`);--> statement-breakpoint
CREATE INDEX `collections_location_idx` ON `collections` (`location_id`);--> statement-breakpoint
CREATE INDEX `collections_catalog_idx` ON `collections` (`catalog_entry_id`);--> statement-breakpoint
CREATE TABLE `document_tags` (
	`document_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`document_id`, `tag_id`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`original_name` text NOT NULL,
	`mime` text NOT NULL,
	`ext` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`location_id` text NOT NULL,
	`rel_path` text NOT NULL,
	`category` text,
	`description` text,
	`author` text,
	`source` text,
	`language` text,
	`page_count` integer,
	`extraction` text DEFAULT 'pending' NOT NULL,
	`extraction_detail` text,
	`text_chars` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `storage_locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `documents_sha_idx` ON `documents` (`sha256`);--> statement-breakpoint
CREATE INDEX `documents_created_idx` ON `documents` (`created_at`);--> statement-breakpoint
CREATE TABLE `downloads` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`kind` text NOT NULL,
	`catalog_entry_id` text,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`location_id` text NOT NULL,
	`rel_path` text NOT NULL,
	`state` text NOT NULL,
	`total_bytes` integer,
	`received_bytes` integer DEFAULT 0 NOT NULL,
	`sha256_expected` text,
	`sha256_actual` text,
	`etag` text,
	`last_modified` text,
	`error` text,
	`error_kind` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`collection_id` text,
	`meta` text NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `storage_locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `downloads_state_idx` ON `downloads` (`state`);--> statement-breakpoint
CREATE TABLE `embedding_models` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`dimensions` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `embeddings` (
	`chunk_id` integer NOT NULL,
	`model_id` text NOT NULL,
	`vector` blob NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`chunk_id`, `model_id`),
	FOREIGN KEY (`chunk_id`) REFERENCES `chunks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`model_id`) REFERENCES `embedding_models`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `embeddings_model_idx` ON `embeddings` (`model_id`);--> statement-breakpoint
CREATE TABLE `imports` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`state` text NOT NULL,
	`original_name` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`analysis` text,
	`options` text,
	`report` text,
	`error` text,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`queue` text NOT NULL,
	`state` text NOT NULL,
	`title` text NOT NULL,
	`payload` text NOT NULL,
	`progress_current` integer DEFAULT 0 NOT NULL,
	`progress_total` integer,
	`progress_message` text,
	`result` text,
	`error` text,
	`error_kind` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 1 NOT NULL,
	`run_after` integer DEFAULT 0 NOT NULL,
	`subject` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_state_idx` ON `jobs` (`queue`,`state`,`run_after`);--> statement-breakpoint
CREATE INDEX `jobs_subject_idx` ON `jobs` (`subject`);--> statement-breakpoint
CREATE TABLE `markers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`color` text DEFAULT 'teal' NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`note_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `note_links` (
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	`target_kind` text NOT NULL,
	PRIMARY KEY(`source_id`, `target_kind`, `target_id`),
	FOREIGN KEY (`source_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_links_target_idx` ON `note_links` (`target_kind`,`target_id`);--> statement-breakpoint
CREATE TABLE `note_tags` (
	`note_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`note_id`, `tag_id`),
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`title` text DEFAULT '' NOT NULL,
	`icon` text,
	`cover_attachment_id` text,
	`content` text NOT NULL,
	`content_text` text DEFAULT '' NOT NULL,
	`content_hash` text DEFAULT '' NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`is_template` integer DEFAULT false NOT NULL,
	`trashed_at` integer,
	`import_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_viewed_at` integer
);
--> statement-breakpoint
CREATE INDEX `notes_parent_idx` ON `notes` (`parent_id`,`position`);--> statement-breakpoint
CREATE INDEX `notes_updated_idx` ON `notes` (`updated_at`);--> statement-breakpoint
CREATE INDEX `notes_import_idx` ON `notes` (`import_key`);--> statement-breakpoint
CREATE TABLE `places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collection_id` text NOT NULL,
	`geoname_id` integer,
	`name` text NOT NULL,
	`ascii_name` text DEFAULT '' NOT NULL,
	`alt_names` text DEFAULT '' NOT NULL,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`feature_class` text,
	`feature_code` text,
	`country` text,
	`admin1` text,
	`population` integer DEFAULT 0 NOT NULL,
	`elevation` integer
);
--> statement-breakpoint
CREATE INDEX `places_collection_idx` ON `places` (`collection_id`);--> statement-breakpoint
CREATE TABLE `search_entities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`collection` text,
	`url` text NOT NULL,
	`source_path` text,
	`meta` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_entities_ref_idx` ON `search_entities` (`kind`,`entity_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `storage_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`kind` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`status` text NOT NULL,
	`status_detail` text,
	`total_bytes` integer,
	`free_bytes` integer,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`color` text DEFAULT 'teal' NOT NULL,
	`geojson` text NOT NULL,
	`source_filename` text,
	`distance_meters` real DEFAULT 0 NOT NULL,
	`ascent_meters` real,
	`point_count` integer DEFAULT 0 NOT NULL,
	`bounds` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);