CREATE TABLE `supply_household` (
	`id` text PRIMARY KEY NOT NULL,
	`days_wanted` integer NOT NULL,
	`drinking_litres` real NOT NULL,
	`all_uses_litres` real NOT NULL,
	`water_basis` text NOT NULL,
	`shopping_worked_at` integer,
	`stock_changed_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `supply_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`quantity` real DEFAULT 0 NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`date_kind` text,
	`date` text,
	`kcal_per_unit` real,
	`kcal_per_100g` real,
	`grams_per_unit` real,
	`litres_per_unit` real,
	`minimum` real,
	`barcode` text,
	`barcode_key` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `supply_items_barcode_idx` ON `supply_items` (`barcode_key`);--> statement-breakpoint
CREATE INDEX `supply_items_date_idx` ON `supply_items` (`date`);--> statement-breakpoint
CREATE TABLE `supply_members` (
	`id` text PRIMARY KEY NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`band` text,
	`sex` text,
	`kcal_per_day` real,
	`drinking_litres` real,
	`all_uses_litres` real,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `supply_products` (
	`barcode_key` text PRIMARY KEY NOT NULL,
	`barcode` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`kcal_per_unit` real,
	`kcal_per_100g` real,
	`grams_per_unit` real,
	`litres_per_unit` real,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `supply_shopping` (
	`id` text PRIMARY KEY NOT NULL,
	`position` integer NOT NULL,
	`source` text NOT NULL,
	`item_id` text,
	`name` text NOT NULL,
	`quantity` real,
	`unit` text DEFAULT '' NOT NULL,
	`reasons` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
