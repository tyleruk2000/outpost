ALTER TABLE `documents` ADD `scan_pages` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `ocr_pages` integer;--> statement-breakpoint
ALTER TABLE `documents` ADD `ocr_detail` text;