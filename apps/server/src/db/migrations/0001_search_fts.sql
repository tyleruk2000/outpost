-- Keyword search over passages. External-content FTS5 table kept in step with `chunks`
-- by triggers, so the text is stored once. Column order matters: bm25() weights and
-- snippet() column numbers in modules/search refer to it.
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  title,
  heading,
  text,
  tags,
  content='chunks',
  content_rowid='id',
  tokenize='porter unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER chunks_fts_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, title, heading, text, tags)
  VALUES (new.id, new.title, new.heading, new.text, new.tags);
END;
--> statement-breakpoint
CREATE TRIGGER chunks_fts_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, title, heading, text, tags)
  VALUES ('delete', old.id, old.title, old.heading, old.text, old.tags);
END;
--> statement-breakpoint
CREATE TRIGGER chunks_fts_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, title, heading, text, tags)
  VALUES ('delete', old.id, old.title, old.heading, old.text, old.tags);
  INSERT INTO chunks_fts(rowid, title, heading, text, tags)
  VALUES (new.id, new.title, new.heading, new.text, new.tags);
END;
--> statement-breakpoint
-- Place names for offline geocoding. Kept apart from chunks: there can be millions of
-- them and they are queried differently (prefix match, ranked by population).
CREATE VIRTUAL TABLE places_fts USING fts5(
  name,
  alt_names,
  content='places',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2',
  prefix='2 3 4'
);
--> statement-breakpoint
CREATE TRIGGER places_fts_ai AFTER INSERT ON places BEGIN
  INSERT INTO places_fts(rowid, name, alt_names) VALUES (new.id, new.name, new.alt_names);
END;
--> statement-breakpoint
CREATE TRIGGER places_fts_ad AFTER DELETE ON places BEGIN
  INSERT INTO places_fts(places_fts, rowid, name, alt_names)
  VALUES ('delete', old.id, old.name, old.alt_names);
END;
