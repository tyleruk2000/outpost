CREATE TABLE `book_chapters` (
	`collection_id` text NOT NULL,
	`document_id` text NOT NULL,
	`key` text NOT NULL,
	`position` integer NOT NULL,
	`section` text DEFAULT '' NOT NULL,
	`number` text,
	`summary` text,
	PRIMARY KEY(`collection_id`, `key`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `book_chapters_document_idx` ON `book_chapters` (`document_id`);--> statement-breakpoint
CREATE INDEX `book_chapters_order_idx` ON `book_chapters` (`collection_id`,`position`);