-- Reference layers (modules/layers). The CHECK constraints are added by hand to the
-- generated tables: a historical record cannot be stored without saying which of the
-- three kinds of record it is, and every feature carries one provenance class.
CREATE TABLE `country_figures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collection_id` text NOT NULL,
	`country` text NOT NULL,
	`indicator` text NOT NULL,
	`value` real,
	`value_text` text DEFAULT '' NOT NULL,
	`unit` text DEFAULT '' NOT NULL,
	`year` text DEFAULT '' NOT NULL,
	`source_title` text NOT NULL,
	`publisher` text NOT NULL,
	`published_at` text DEFAULT '' NOT NULL,
	`url` text,
	`page` text DEFAULT '' NOT NULL,
	`license` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`retrieved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `country_figures_country_idx` ON `country_figures` (`country`);--> statement-breakpoint
CREATE INDEX `country_figures_collection_idx` ON `country_figures` (`collection_id`);--> statement-breakpoint
CREATE TABLE `historical_records` (
	`feature_id` integer PRIMARY KEY NOT NULL,
	`record_type` text NOT NULL CHECK (`record_type` IN ('target-list', 'assessment', 'speculation')),
	`period` text NOT NULL,
	`location_text` text DEFAULT '' NOT NULL,
	`document_title` text NOT NULL,
	`document_publisher` text DEFAULT '' NOT NULL,
	`document_date` text DEFAULT '' NOT NULL,
	`archive_ref` text DEFAULT '' NOT NULL,
	`classification` text DEFAULT '' NOT NULL,
	`target_category` text DEFAULT '' NOT NULL,
	`evidence_quality` text NOT NULL CHECK (length(`evidence_quality`) > 0),
	`geographic_precision` text NOT NULL CHECK (length(`geographic_precision`) > 0),
	`citations` text NOT NULL,
	`document_url` text,
	`library_document_id` text,
	`notes` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`feature_id`) REFERENCES `reference_features`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reference_features` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collection_id` text NOT NULL,
	`provider` text NOT NULL,
	`source_id` text NOT NULL,
	`layer` text NOT NULL,
	`kind` text DEFAULT '' NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`alt_names` text DEFAULT '' NOT NULL,
	`country` text,
	`lat` real,
	`lon` real,
	`min_lon` real,
	`min_lat` real,
	`max_lon` real,
	`max_lat` real,
	`geometry` text,
	`props` text NOT NULL,
	`provenance` text NOT NULL CHECK (`provenance` IN ('public-infrastructure', 'historical', 'user', 'unverified')),
	`accuracy` text NOT NULL,
	`accuracy_m` real,
	`publisher` text NOT NULL,
	`license` text NOT NULL,
	`source_url` text,
	`published_at` text,
	`retrieved_at` integer NOT NULL,
	`duplicate_of` integer
);
--> statement-breakpoint
CREATE INDEX `reference_features_collection_idx` ON `reference_features` (`collection_id`);--> statement-breakpoint
CREATE INDEX `reference_features_layer_idx` ON `reference_features` (`layer`,`country`);--> statement-breakpoint
CREATE INDEX `reference_features_source_idx` ON `reference_features` (`provider`,`source_id`);--> statement-breakpoint
CREATE INDEX `reference_features_duplicate_idx` ON `reference_features` (`duplicate_of`);--> statement-breakpoint
-- The spatial index of reference features: one box per feature that has a place. A point
-- is a box of no size. Kept by the triggers below; a feature with no place is not in it.
CREATE VIRTUAL TABLE reference_features_rtree USING rtree(id, min_lon, max_lon, min_lat, max_lat);
--> statement-breakpoint
CREATE TRIGGER reference_features_rtree_ai AFTER INSERT ON reference_features WHEN new.lat IS NOT NULL AND new.lon IS NOT NULL BEGIN
  INSERT INTO reference_features_rtree(id, min_lon, max_lon, min_lat, max_lat)
  VALUES (new.id, coalesce(new.min_lon, new.lon), coalesce(new.max_lon, new.lon), coalesce(new.min_lat, new.lat), coalesce(new.max_lat, new.lat));
END;
--> statement-breakpoint
CREATE TRIGGER reference_features_rtree_ad AFTER DELETE ON reference_features BEGIN
  DELETE FROM reference_features_rtree WHERE id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER reference_features_rtree_au AFTER UPDATE OF lat, lon, min_lon, min_lat, max_lon, max_lat ON reference_features BEGIN
  DELETE FROM reference_features_rtree WHERE id = old.id;
  INSERT INTO reference_features_rtree(id, min_lon, max_lon, min_lat, max_lat)
  SELECT new.id, coalesce(new.min_lon, new.lon), coalesce(new.max_lon, new.lon), coalesce(new.min_lat, new.lat), coalesce(new.max_lat, new.lat)
  WHERE new.lat IS NOT NULL AND new.lon IS NOT NULL;
END;
--> statement-breakpoint
-- Names of reference features, for finding one by name from the map and from search.
CREATE VIRTUAL TABLE reference_features_fts USING fts5(
  name,
  alt_names,
  content='reference_features',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2',
  prefix='2 3 4'
);
--> statement-breakpoint
CREATE TRIGGER reference_features_fts_ai AFTER INSERT ON reference_features BEGIN
  INSERT INTO reference_features_fts(rowid, name, alt_names) VALUES (new.id, new.name, new.alt_names);
END;
--> statement-breakpoint
CREATE TRIGGER reference_features_fts_ad AFTER DELETE ON reference_features BEGIN
  INSERT INTO reference_features_fts(reference_features_fts, rowid, name, alt_names)
  VALUES ('delete', old.id, old.name, old.alt_names);
END;
--> statement-breakpoint
CREATE TRIGGER reference_features_fts_au AFTER UPDATE OF name, alt_names ON reference_features BEGIN
  INSERT INTO reference_features_fts(reference_features_fts, rowid, name, alt_names)
  VALUES ('delete', old.id, old.name, old.alt_names);
  INSERT INTO reference_features_fts(rowid, name, alt_names) VALUES (new.id, new.name, new.alt_names);
END;
