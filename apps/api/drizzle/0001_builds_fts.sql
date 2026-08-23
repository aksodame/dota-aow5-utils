-- Full-text search over builds.
--
-- Hand-written, because drizzle-kit does not model virtual tables or triggers.
-- That is worth remembering when `db:generate` reports an empty diff: it means
-- nothing *drizzle-kit can see* changed, not that the schema is unchanged.
--
-- `content='builds'` makes this an external-content index: the text is not
-- duplicated, only the terms are, and the triggers below are what keep the two
-- in step. Without all three of them the index silently rots.
--
-- `unicode61` and not `porter`: the porter stemmer is English-only, and this
-- site is read in English and Russian. Stemming one and not the other would
-- quietly make one of them search worse. `remove_diacritics 2` folds case and
-- accents for both alphabets, which is what makes a Cyrillic search work at all.
CREATE VIRTUAL TABLE `builds_fts` USING fts5(
	title,
	summary,
	body,
	content='builds',
	content_rowid='id',
	tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
-- Backfill. Empty on a new database, and the reason this migration is safe to
-- add to one that already has builds in it.
INSERT INTO `builds_fts`(`rowid`, `title`, `summary`, `body`)
	SELECT `id`, `title`, `summary`, `body` FROM `builds`;
--> statement-breakpoint
CREATE TRIGGER `builds_fts_ai` AFTER INSERT ON `builds` BEGIN
	INSERT INTO `builds_fts`(`rowid`, `title`, `summary`, `body`)
		VALUES (new.`id`, new.`title`, new.`summary`, new.`body`);
END;
--> statement-breakpoint
-- An external-content index cannot delete a row by id alone; it needs the old
-- values to know which terms to remove. That is what the 'delete' command form
-- below is for, and passing the *new* values there would corrupt the index.
CREATE TRIGGER `builds_fts_ad` AFTER DELETE ON `builds` BEGIN
	INSERT INTO `builds_fts`(`builds_fts`, `rowid`, `title`, `summary`, `body`)
		VALUES ('delete', old.`id`, old.`title`, old.`summary`, old.`body`);
END;
--> statement-breakpoint
CREATE TRIGGER `builds_fts_au` AFTER UPDATE ON `builds` BEGIN
	INSERT INTO `builds_fts`(`builds_fts`, `rowid`, `title`, `summary`, `body`)
		VALUES ('delete', old.`id`, old.`title`, old.`summary`, old.`body`);
	INSERT INTO `builds_fts`(`rowid`, `title`, `summary`, `body`)
		VALUES (new.`id`, new.`title`, new.`summary`, new.`body`);
END;
