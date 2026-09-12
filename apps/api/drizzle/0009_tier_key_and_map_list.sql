-- A guide names one tier and any number of rooms.
--
-- Two changes that arrive together because they are one decision. A build used
-- to derive its tier from its single room, which could not express either half
-- of what guides actually are:
--
--   * a guide for a tier without a particular room — most tiers have two, and
--     advice that holds for both had to pick one and be wrong for half its
--     readers, or be published twice;
--   * Event content, which sits on no tier at all and which the extracted data
--     has no word for.
--
-- So `tier` becomes the author's own field and `map_id` becomes a table.
--
-- **`tier` is text.** One of its values is `event`, and a column that is a
-- number for nine of its ten cases and a sentinel for the tenth is a column
-- every reader has to be warned about. `'1'`..`'9'` sort as strings here, which
-- is fine because nothing orders by it — the browse page filters on equality
-- and sorts by likes, price or date.
--
-- Existing rows keep their tier, as its own digits. Their single room becomes
-- the first row of their map list. Nothing is dropped.
CREATE TABLE `build_maps` (
	`build_id` integer NOT NULL,
	`map_id` text NOT NULL,
	PRIMARY KEY(`build_id`, `map_id`),
	FOREIGN KEY (`build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- The browse filter's whole job: every build that names this room.
CREATE INDEX `build_maps_map` ON `build_maps` (`map_id`);
--> statement-breakpoint
INSERT INTO `build_maps` (`build_id`, `map_id`)
SELECT `id`, `map_id` FROM `builds` WHERE `map_id` IS NOT NULL AND `map_id` != '';
--> statement-breakpoint

-- SQLite cannot change a column's type in place, so `builds` is rebuilt. The
-- new row is the old one with `map_id` gone and `tier` widened to text.
CREATE TABLE `builds_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`user_id` integer NOT NULL,
	`slot` integer NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`payload` text NOT NULL,
	`referral` text DEFAULT '' NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`tier` text,
	`video_id` text DEFAULT '' NOT NULL,
	`video_start` integer DEFAULT 0 NOT NULL,
	`codec_version` integer NOT NULL,
	`hero_id` text,
	`item_count` integer NOT NULL,
	`spell_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`comment_count` integer DEFAULT 0 NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `builds_slot_range` CHECK(`slot` >= 0 and `slot` < 5),
	CONSTRAINT `builds_tier` CHECK(`tier` is null or `tier` in ('1','2','3','4','5','6','7','8','9','event'))
);
--> statement-breakpoint
INSERT INTO `builds_new` (
	`id`, `slug`, `user_id`, `slot`, `title`, `body`, `payload`, `referral`, `price`, `tier`,
	`video_id`, `video_start`, `codec_version`, `hero_id`, `item_count`, `spell_count`, `status`,
	`like_count`, `comment_count`, `view_count`, `published_at`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
	`id`, `slug`, `user_id`, `slot`, `title`, `body`, `payload`, `referral`, `price`,
	-- The digits it already had. A row with no tier keeps none.
	CASE WHEN `tier` IS NULL THEN NULL ELSE CAST(`tier` AS text) END,
	`video_id`, `video_start`, `codec_version`, `hero_id`, `item_count`, `spell_count`, `status`,
	`like_count`, `comment_count`, `view_count`, `published_at`, `created_at`, `updated_at`, `deleted_at`
FROM `builds`;
--> statement-breakpoint
-- The FTS index is external-content over `builds` and is kept in step by
-- triggers on it. Both go with the table and are recreated below.
DROP TRIGGER IF EXISTS `builds_fts_ai`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `builds_fts_au`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `builds_fts_ad`;
--> statement-breakpoint
DROP TABLE `builds`;
--> statement-breakpoint
ALTER TABLE `builds_new` RENAME TO `builds`;
--> statement-breakpoint
CREATE UNIQUE INDEX `builds_slug` ON `builds` (`slug`);
--> statement-breakpoint
CREATE UNIQUE INDEX `builds_user_slot` ON `builds` (`user_id`,`slot`) WHERE `deleted_at` is null;
--> statement-breakpoint
CREATE INDEX `builds_browse` ON `builds` (`status`,`published_at`);
--> statement-breakpoint
CREATE INDEX `builds_user` ON `builds` (`user_id`);
--> statement-breakpoint
CREATE INDEX `builds_hero` ON `builds` (`hero_id`,`status`);
--> statement-breakpoint
CREATE INDEX `builds_tier` ON `builds` (`tier`,`status`);
--> statement-breakpoint
CREATE INDEX `builds_top` ON `builds` (`status`,`like_count`);
--> statement-breakpoint
CREATE INDEX `builds_price` ON `builds` (`status`,`price`);
--> statement-breakpoint
-- Recreated byte for byte from 0002, which is the version that dropped
-- `summary` from the index. A trigger that names a column the table no longer
-- has fails on the next write rather than here.
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
--> statement-breakpoint
-- Rebuilt rather than assumed: the rows were copied into a new table and a
-- stale index shows search results for builds that are not there.
INSERT INTO `builds_fts`(`builds_fts`) VALUES('rebuild');
