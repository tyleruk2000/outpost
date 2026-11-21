CREATE TABLE `comms_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `household_binder` (
	`id` text PRIMARY KEY NOT NULL,
	`parts` text NOT NULL,
	`content_at` integer NOT NULL,
	`made_at` integer NOT NULL,
	`pages` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `medical_sheets` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text,
	`name` text NOT NULL,
	`record` text,
	`armor` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
