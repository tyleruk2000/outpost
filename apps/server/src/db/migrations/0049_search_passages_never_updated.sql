-- A passage is never changed in place any more: the search service puts it back under a
-- new number instead (modules/search/service.ts, `upsert`). An UPDATE took the passage out
-- of both full-text indexes and put it back under the same number, and a passage with that
-- history that is later erased with the index's secure-delete on (an encrypting save)
-- leaves the index broken in SQLite 3.54: "database disk image is malformed" from "Did you
-- mean". So the triggers that followed UPDATEs go, an UPDATE of what is indexed is refused,
-- and both indexes are built again from the passages, which repairs any broken already.
DROP TRIGGER IF EXISTS chunks_fts_au;
--> statement-breakpoint
DROP TRIGGER IF EXISTS chunks_words_au;
--> statement-breakpoint
CREATE TRIGGER chunks_not_updated BEFORE UPDATE OF title, tags, heading, text ON chunks BEGIN
  SELECT RAISE(ABORT, 'a passage is not changed in place: delete it and insert it again');
END;
--> statement-breakpoint
INSERT INTO chunks_fts(chunks_fts) VALUES ('rebuild');
--> statement-breakpoint
INSERT INTO chunks_words(chunks_words) VALUES ('rebuild');
