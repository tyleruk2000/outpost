CREATE TABLE `chat_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`title_set` integer DEFAULT false NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`use_library` integer DEFAULT false NOT NULL,
	`scope_kind` text,
	`scope_entity_id` text,
	`scope_title` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_conversations_updated_idx` ON `chat_conversations` (`updated_at`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`seq` integer NOT NULL,
	`role` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'complete' NOT NULL,
	`failure` text,
	`notice` text,
	`model` text,
	`grounded` integer DEFAULT false NOT NULL,
	`sources` text,
	`searched_for` text,
	`omitted` integer DEFAULT 0 NOT NULL,
	`took_ms` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `chat_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_messages_order_idx` ON `chat_messages` (`conversation_id`,`seq`);