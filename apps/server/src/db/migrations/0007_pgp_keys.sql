CREATE TABLE `pgp_keys` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`public_armored` text NOT NULL,
	`private_armored` text,
	`mine` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
