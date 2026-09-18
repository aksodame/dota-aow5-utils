-- Which season of the game a guide is written for.
--
-- The addon relaunched as seasons: S1 and S2 are separate maps with separate
-- hero pools (`SEASON_HEROES` in `aow5-shared`), so a guide for one is not
-- advice about the other even when it names the same hero. Axe is in both.
--
-- An integer rather than a text key like `tier`: every value is a number, and
-- nothing here needs a sentinel. The CHECK is the list of seasons that exist;
-- a third season is a migration that widens it.
--
-- Default 1, which is also the backfill: every guide written before this
-- column existed was written for the only game there was, and that is S1.
ALTER TABLE `builds` ADD COLUMN `season` integer DEFAULT 1 NOT NULL CHECK (`season` in (1, 2));
--> statement-breakpoint
-- The browse page's new facet. Season leads, like tier does in `builds_tier`,
-- because it is the coarse filter the sidebar applies first.
CREATE INDEX `builds_season` ON `builds` (`season`, `status`);
