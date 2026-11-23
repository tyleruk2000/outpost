-- The words of every passage as they are written, not cut back to their roots: what
-- "Did you mean" chooses from (modules/search/suggest.ts). Only which passages hold a
-- word is kept (detail=none), not where in them, so it is a fraction of the size of the
-- keyword index. Kept in step with `chunks` by triggers, as `chunks_fts` is.
CREATE VIRTUAL TABLE chunks_words USING fts5(
  title,
  heading,
  text,
  content='chunks',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2',
  detail='none',
  columnsize=0
);
--> statement-breakpoint
CREATE TRIGGER chunks_words_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_words(rowid, title, heading, text) VALUES (new.id, new.title, new.heading, new.text);
END;
--> statement-breakpoint
CREATE TRIGGER chunks_words_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_words(chunks_words, rowid, title, heading, text) VALUES ('delete', old.id, old.title, old.heading, old.text);
END;
--> statement-breakpoint
CREATE TRIGGER chunks_words_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_words(chunks_words, rowid, title, heading, text) VALUES ('delete', old.id, old.title, old.heading, old.text);
  INSERT INTO chunks_words(rowid, title, heading, text) VALUES (new.id, new.title, new.heading, new.text);
END;
--> statement-breakpoint
INSERT INTO chunks_words(chunks_words) VALUES ('rebuild');
