-- A third season: S3, whose pool is every hero the game ships.
--
-- The column's CHECK is the list of seasons that exist, and SQLite cannot
-- alter a constraint in place. 0009 and 0012 rebuilt `builds` for the same
-- reason, and a rebuild is the wrong tool here: `DROP TABLE builds` under
-- `foreign_keys = ON` is an implicit `DELETE FROM`, which fires the cascades on
-- `likes`, `comments` and `build_maps` — and the migrator runs inside a
-- transaction, where that pragma cannot be switched off.
--
-- So only the column is replaced. `DROP COLUMN` rewrites the rows without
-- deleting any, and a column whose only CHECK is its own may be dropped. The
-- values go through a scratch column and come back unchanged.
ALTER TABLE `builds` ADD COLUMN `season_was` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
UPDATE `builds` SET `season_was` = `season`;
--> statement-breakpoint
DROP INDEX `builds_season`;
--> statement-breakpoint
ALTER TABLE `builds` DROP COLUMN `season`;
--> statement-breakpoint
ALTER TABLE `builds` ADD COLUMN `season` integer DEFAULT 1 NOT NULL CHECK (`season` in (1, 2, 3));
--> statement-breakpoint
UPDATE `builds` SET `season` = `season_was`;
--> statement-breakpoint
ALTER TABLE `builds` DROP COLUMN `season_was`;
--> statement-breakpoint
CREATE INDEX `builds_season` ON `builds` (`season`, `status`);
