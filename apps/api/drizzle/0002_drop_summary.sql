-- Drops the summary field.
--
-- A build already carries a title and free-text notes; a third box between them
-- was one more thing to write and one more thing to skip, and what people
-- actually put in it was either the title again or the first line of the notes.
--
-- Forward-only, rather than editing 0000. A committed migration is never
-- rewritten: doing that once already invalidated a developer database, because
-- Drizzle identifies a migration by the hash of its SQL and a rewritten one
-- looks like one that has never run.
--
-- The FTS index has to be rebuilt around the change: it is an external-content
-- table whose column list names `summary`, so the column cannot go while the
-- index still expects it.
DROP TRIGGER IF EXISTS `builds_fts_ai`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `builds_fts_ad`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `builds_fts_au`;
--> statement-breakpoint
DROP TABLE IF EXISTS `builds_fts`;
--> statement-breakpoint
ALTER TABLE `builds` DROP COLUMN `summary`;
--> statement-breakpoint
CREATE VIRTUAL TABLE `builds_fts` USING fts5(
	title,
	body,
	content='builds',
	content_rowid='id',
	tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
INSERT INTO `builds_fts`(`rowid`, `title`, `body`)
	SELECT `id`, `title`, `body` FROM `builds`;
--> statement-breakpoint
CREATE TRIGGER `builds_fts_ai` AFTER INSERT ON `builds` BEGIN
	INSERT INTO `builds_fts`(`rowid`, `title`, `body`) VALUES (new.`id`, new.`title`, new.`body`);
END;
--> statement-breakpoint
CREATE TRIGGER `builds_fts_ad` AFTER DELETE ON `builds` BEGIN
	INSERT INTO `builds_fts`(`builds_fts`, `rowid`, `title`, `body`)
		VALUES ('delete', old.`id`, old.`title`, old.`body`);
END;
--> statement-breakpoint
CREATE TRIGGER `builds_fts_au` AFTER UPDATE ON `builds` BEGIN
	INSERT INTO `builds_fts`(`builds_fts`, `rowid`, `title`, `body`)
		VALUES ('delete', old.`id`, old.`title`, old.`body`);
	INSERT INTO `builds_fts`(`rowid`, `title`, `body`) VALUES (new.`id`, new.`title`, new.`body`);
END;
