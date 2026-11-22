PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_emergency_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`kind_text` text DEFAULT '' NOT NULL,
	`template_id` text,
	`emergency_number` text DEFAULT '112' NOT NULL,
	`review_every_days` integer,
	`body` text NOT NULL,
	`use` text NOT NULL,
	`reviewed_at` integer NOT NULL,
	`opened_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_emergency_plans`("id", "name", "kind", "kind_text", "template_id", "emergency_number", "review_every_days", "body", "use", "reviewed_at", "opened_at", "created_at", "updated_at") SELECT "id", "name", "kind", "kind_text", "template_id", "emergency_number", "review_every_days", "body", "use", "reviewed_at", "opened_at", "created_at", "updated_at" FROM `emergency_plans`;--> statement-breakpoint
DROP TABLE `emergency_plans`;--> statement-breakpoint
ALTER TABLE `__new_emergency_plans` RENAME TO `emergency_plans`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `supply_household` ADD `energy_table` text;